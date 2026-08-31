// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

// Bounds on the tree we actually ship over IPC. A full-disk scan can touch
// millions of files; sending all of them as one JSON payload (each with its
// own full path string, at every depth) is the app's biggest perf problem.
// Instead we cache the full index server-side (see ScanIndex) and only ever
// send a bounded summary tree plus on-demand slices of it.
const MAX_TREE_DEPTH: usize = 5;
const MAX_CHILDREN_PER_DIR: usize = 60;
const SUMMARY_NODE_BUDGET: i64 = 15_000;
const LARGE_FILE_THRESHOLD: u64 = 100 * 1024 * 1024;
const LICENSE_SERVICE: &str = "com.reclaim.app.license";
const DODO_API_BASE: &str = "https://live.dodopayments.com";

const DEV_DIR_TARGETS: &[(&str, &str)] = &[
    ("node_modules", "Node Modules"),
    (".venv", "Python Virtualenvs"),
    ("venv", "Python Virtualenvs"),
    ("__pycache__", "Python Cache"),
    (".pytest_cache", "Python Cache"),
    (".next", "Build Outputs"),
    (".nuxt", "Build Outputs"),
    (".gradle", "Package Caches"),
    ("Pods", "Package Caches"),
    (".dart_tool", "Package Caches"),
];

const AI_CACHE_KEYWORDS: &[&str] = &[
    "/huggingface", "/lm-studio", "/ollama", "/comfyui", "/cursor", "/github-copilot",
    "/.gemini", "/antigravity", "/claude", "/anthropic", "/chatgpt", "/openai",
    "/codeium", "/tabnine", "/continue", "/cody", "/sourcegraph", "/windsurf",
    "/aider", "/torch", "/tensorflow", "/.keras", "/conda", "/miniconda", "/pip", "/jupyter",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanNode {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<ScanNode>>,
    #[serde(default)]
    is_aggregate: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanSummary {
    tree: ScanNode,
    large_files_size: u64,
    ai_cache_size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DuplicateGroup {
    size: u64,
    paths: Vec<String>,
}

/// The full result of the last disk scan, kept server-side so every
/// downstream view (large files, AI caches, leftovers, duplicates, search,
/// drill-down) can query it directly instead of the frontend re-walking a
/// giant JSON tree it was handed once.
struct ScanIndex {
    sizes: HashMap<PathBuf, u64>,
    dirs: HashSet<PathBuf>,
    dir_children: HashMap<PathBuf, Vec<PathBuf>>,
    dir_sizes: HashMap<PathBuf, u64>,
}

struct ScanState(Mutex<Option<ScanIndex>>);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LicenseState {
    status: String,
    masked_key: Option<String>,
    activation_instance_id: Option<String>,
    last_validated_at: Option<u64>,
    can_use_paid_features: bool,
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct StoredLicense {
    key: String,
    instance_id: Option<String>,
    last_validated_at: Option<u64>,
    consecutive_failures: u8,
}

fn keychain_read() -> Option<StoredLicense> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", LICENSE_SERVICE, "-w"])
        .output().ok()?;
    if !output.status.success() { return None; }
    serde_json::from_slice(&output.stdout).ok()
}

fn keychain_write(value: &StoredLicense) -> Result<(), String> {
    let encoded = serde_json::to_string(value).map_err(|e| e.to_string())?;
    let status = Command::new("security")
        .args(["add-generic-password", "-a", "reclaim", "-s", LICENSE_SERVICE, "-w", &encoded, "-U"])
        .status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Unable to securely store the license in macOS Keychain".into()) }
}

fn now_secs() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }

fn machine_id() -> String {
    let output = Command::new("ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output();
    if let Ok(output) = output {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(value) = text.lines().find_map(|line| {
            let marker = "IOPlatformUUID";
            let start = line.find(marker)?.checked_add(marker.len())?;
            let rest = &line[start..];
            let first = rest.find('"')?.checked_add(1)?;
            let tail = &rest[first..];
            let end = tail.find('"')?;
            Some(tail[..end].to_string())
        }) { return value; }
    }
    std::env::var("HOSTNAME").unwrap_or_else(|_| "reclaim-device".into())
}

fn masked_key(key: &str) -> String {
    if key.len() <= 8 { return "••••••••".into(); }
    format!("{}••••{}", &key[..4], &key[key.len()-4..])
}

fn public_license_request(endpoint: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let body = serde_json::to_string(&body).map_err(|e| e.to_string())?;
    let output = Command::new("curl")
        .args(["-fsS", "--max-time", "15", "-X", "POST", &format!("{DODO_API_BASE}{endpoint}"), "-H", "Content-Type: application/json", "-d", &body])
        .output().map_err(|e| format!("Network request failed: {e}"))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().to_string()); }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Invalid licensing response: {e}"))
}

fn current_license_state() -> LicenseState {
    match keychain_read() {
        Some(stored) => LicenseState { status: "active".into(), masked_key: Some(masked_key(&stored.key)), activation_instance_id: stored.instance_id, last_validated_at: stored.last_validated_at, can_use_paid_features: stored.consecutive_failures < 2, message: None },
        None => LicenseState { status: "unlicensed".into(), can_use_paid_features: false, ..Default::default() },
    }
}

fn require_license() -> Result<(), String> {
    if current_license_state().can_use_paid_features { Ok(()) } else { Err("A valid Reclaim license is required for cleanup actions.".into()) }
}

fn node_size(index: &ScanIndex, p: &Path) -> u64 {
    if index.dirs.contains(p) {
        *index.dir_sizes.get(p).unwrap_or(&0)
    } else {
        *index.sizes.get(p).unwrap_or(&0)
    }
}

fn file_name_of(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string_lossy().into_owned())
}

fn ends_with_hidden_segment(lower_path: &str) -> bool {
    match lower_path.rsplit('/').next() {
        Some(last) if last.len() > 1 && last.starts_with('.') => last[1..]
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-'),
        _ => false,
    }
}

fn is_ai_cache_path(lower_path: &str) -> bool {
    let is_cache_dir = lower_path.contains("/.cache/")
        || lower_path.contains("/library/caches/")
        || lower_path.contains("/library/application support/")
        || lower_path.contains("/.config/")
        || lower_path.contains("/.local/share/")
        || ends_with_hidden_segment(lower_path);

    if !is_cache_dir {
        return false;
    }

    AI_CACHE_KEYWORDS.iter().any(|k| lower_path.contains(k))
}

fn is_protected_path(path_str: &str) -> bool {
    static HOME_DIR: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    let home = HOME_DIR.get_or_init(|| dirs::home_dir().map(|p| p.to_string_lossy().to_string()));

    let protected_roots = [
        "/System",
        "/bin",
        "/sbin",
        "/usr",
        "/etc",
        "/var",
        "/private",
        "/cores",
        "/Network",
    ];

    let exact_protected = [
        "/",
        "/Applications",
        "/Library",
        "/Users",
        "/Volumes",
    ];

    if exact_protected.contains(&path_str) {
        return true;
    }

    if protected_roots.iter().any(|&p| path_str == p || (path_str.starts_with(p) && path_str.as_bytes().get(p.len()) == Some(&b'/'))) {
        return true;
    }

    if let Some(user_home) = home {
        if path_str == user_home {
            return true;
        }
        if path_str.starts_with(user_home) {
            let rest = &path_str[user_home.len()..];
            if rest == "/Library" {
                return true;
            }
        }
    }

    false
}

/// Recursively builds a depth- and breadth-capped tree for the treemap/explorer
/// overview. Regardless of how many files are actually on disk, this is bounded
/// by MAX_TREE_DEPTH, MAX_CHILDREN_PER_DIR and SUMMARY_NODE_BUDGET, so the JSON
/// payload sent to the frontend stays small and fast to (de)serialize. Anything
/// truncated here is still reachable via `get_children`.
fn build_summary_node(
    path: &Path,
    depth: usize,
    budget: &mut i64,
    dirs: &HashSet<PathBuf>,
    dir_children: &HashMap<PathBuf, Vec<PathBuf>>,
    sizes: &HashMap<PathBuf, u64>,
    dir_sizes: &HashMap<PathBuf, u64>,
) -> ScanNode {
    *budget -= 1;

    let name = file_name_of(path);
    let path_str = path.to_string_lossy().into_owned();
    let is_dir = dirs.contains(path);

    if !is_dir {
        return ScanNode {
            path: path_str,
            name,
            size: *sizes.get(path).unwrap_or(&0),
            is_dir: false,
            children: None,
            is_aggregate: false,
        };
    }

    let total_size = *dir_sizes.get(path).unwrap_or(&0);

    if depth >= MAX_TREE_DEPTH || *budget <= 0 {
        return ScanNode {
            path: path_str,
            name,
            size: total_size,
            is_dir: true,
            children: None,
            is_aggregate: false,
        };
    }

    let size_of = |p: &Path| -> u64 {
        if dirs.contains(p) {
            *dir_sizes.get(p).unwrap_or(&0)
        } else {
            *sizes.get(p).unwrap_or(&0)
        }
    };

    let mut children: Vec<&PathBuf> = dir_children.get(path).map(|v| v.iter().collect()).unwrap_or_default();
    children.sort_by_key(|c| std::cmp::Reverse(size_of(c)));

    let mut child_nodes: Vec<ScanNode> = Vec::new();
    if children.len() > MAX_CHILDREN_PER_DIR {
        let (visible, rest) = children.split_at(MAX_CHILDREN_PER_DIR);
        for c in visible {
            child_nodes.push(build_summary_node(c, depth + 1, budget, dirs, dir_children, sizes, dir_sizes));
        }
        let rest_size: u64 = rest.iter().map(|c| size_of(c)).sum();
        child_nodes.push(ScanNode {
            path: format!("{}\u{0}__more__", path_str),
            name: format!("{} more items", rest.len()),
            size: rest_size,
            is_dir: false,
            children: None,
            is_aggregate: true,
        });
    } else {
        for c in children {
            child_nodes.push(build_summary_node(c, depth + 1, budget, dirs, dir_children, sizes, dir_sizes));
        }
    }

    ScanNode {
        path: path_str,
        name,
        size: total_size,
        is_dir: true,
        children: Some(child_nodes),
        is_aggregate: false,
    }
}

fn compute_dir_size(
    p: &Path,
    dirs: &HashSet<PathBuf>,
    dir_children: &HashMap<PathBuf, Vec<PathBuf>>,
    sizes: &HashMap<PathBuf, u64>,
    memo: &mut HashMap<PathBuf, u64>,
) -> u64 {
    if let Some(&s) = memo.get(p) {
        return s;
    }
    let total: u64 = match dir_children.get(p) {
        Some(children) => children
            .iter()
            .map(|c| {
                if dirs.contains(c) {
                    compute_dir_size(c, dirs, dir_children, sizes, memo)
                } else {
                    *sizes.get(c).unwrap_or(&0)
                }
            })
            .sum(),
        None => 0,
    };
    memo.insert(p.to_path_buf(), total);
    total
}

#[tauri::command]
async fn scan_path(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    path: String,
    exclusions: Option<Vec<String>>,
) -> Result<ScanSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut sizes: HashMap<PathBuf, u64> = HashMap::new();
        let mut dirs: HashSet<PathBuf> = HashSet::new();
        let mut dir_children: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
        let mut total_scanned_bytes = 0u64;
        let mut total_files = 0u32;

        let mut exclusions_list = exclusions.unwrap_or_default();

        // Add macOS default exclusions to prevent APFS firmlink loops and external mount double-counting
        if path == "/" {
            let default_mac_exclusions = vec![
                "/System/Volumes".to_string(), // APFS Firmlinks data volume (prevents 2x counting)
                "/Volumes".to_string(),        // External drives / network mounts
                "/dev".to_string(),
                "/Network".to_string(),
                "/net".to_string(),
                "/home".to_string(),           // auto_home mounts
                "/.Spotlight-V100".to_string(),
                "/.fseventsd".to_string(),
            ];
            for ex in default_mac_exclusions {
                if !exclusions_list.contains(&ex) {
                    exclusions_list.push(ex);
                }
            }
        }

        let exclusions_for_walk = exclusions_list.clone();

        for entry in jwalk::WalkDir::new(&path)
            .skip_hidden(false)
            .process_read_dir(move |_depth, _path, _read_dir_state, children| {
                children.retain(|child_result| {
                    if let Ok(ref child) = child_result {
                        let child_path = child.path();
                        let child_str = child_path.to_string_lossy();
                        !exclusions_for_walk.iter().any(|ex| child_str.starts_with(ex))
                    } else {
                        true
                    }
                });
            })
        {
            if let Ok(entry) = entry {
                let parent = entry.path().parent().map(|p| p.to_path_buf());
                let current = entry.path();

                if entry.file_type().is_dir() {
                    dirs.insert(current.clone());
                } else if entry.file_type().is_file() {
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    sizes.insert(current.clone(), size);
                    total_scanned_bytes += size;
                    total_files += 1;
                }

                if let Some(parent_path) = parent {
                    dir_children.entry(parent_path).or_default().push(current.clone());
                }

                // Emit progress every 1000 files to avoid spamming the UI thread
                if total_files > 0 && total_files % 1000 == 0 {
                    let _ = window.emit("scan_progress", total_scanned_bytes);
                }
            }
        }

        // Final progress emit
        let _ = window.emit("scan_progress", total_scanned_bytes);

        // Roll up directory sizes bottom-up once. No per-node String/JSON
        // allocation here -- just u64 accumulation into a HashMap.
        let mut dir_sizes: HashMap<PathBuf, u64> = HashMap::new();
        for d in dirs.iter() {
            compute_dir_size(d, &dirs, &dir_children, &sizes, &mut dir_sizes);
        }

        // Cheap aggregate badges computed directly from the size map -- no
        // path lists materialized, just a couple of linear scans.
        let large_files_size: u64 = sizes.values().copied().filter(|&s| s > LARGE_FILE_THRESHOLD).sum();
        let ai_cache_size: u64 = sizes
            .iter()
            .filter(|(p, _)| is_ai_cache_path(&p.to_string_lossy().to_lowercase()))
            .map(|(_, &s)| s)
            .sum();

        // Bounded summary tree -- this, not the full file list, is what
        // actually crosses the IPC boundary.
        let mut budget = SUMMARY_NODE_BUDGET;
        let tree = build_summary_node(Path::new(&path), 0, &mut budget, &dirs, &dir_children, &sizes, &dir_sizes);

        // Cache the full index server-side so get_children / get_large_files /
        // get_ai_cache_files / get_leftover_candidates / find_duplicates /
        // search_files can all answer from memory without re-walking disk or
        // shipping the whole tree to the frontend.
        let index = ScanIndex { sizes, dirs, dir_children, dir_sizes };
        let state = app_handle.state::<ScanState>();
        *state.0.lock().map_err(|_| "Scan lock poisoned".to_string())? = Some(index);

        Ok(ScanSummary { tree, large_files_size, ai_cache_size })
    })
    .await
    .unwrap_or_else(|_| Err("Scan panicked".to_string()))
}

#[tauri::command]
fn get_children(state: tauri::State<ScanState>, path: String) -> Result<Vec<ScanNode>, String> {
    let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
    let index = guard.as_ref().ok_or_else(|| "No scan data available. Please run a scan first.".to_string())?;

    let p = PathBuf::from(&path);
    let mut children: Vec<PathBuf> = index.dir_children.get(&p).cloned().unwrap_or_default();
    children.sort_by_key(|c| std::cmp::Reverse(node_size(index, c)));
    children.truncate(500);

    Ok(children
        .into_iter()
        .map(|c| {
            let is_dir = index.dirs.contains(&c);
            let size = node_size(index, &c);
            ScanNode {
                path: c.to_string_lossy().into_owned(),
                name: file_name_of(&c),
                size,
                is_dir,
                children: None,
                is_aggregate: false,
            }
        })
        .collect())
}

#[tauri::command]
fn get_large_files(state: tauri::State<ScanState>, min_size: u64) -> Result<Vec<ScanNode>, String> {
    let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
    let index = guard.as_ref().ok_or_else(|| "No scan data available. Please run a scan first.".to_string())?;

    let mut results: Vec<ScanNode> = index
        .sizes
        .iter()
        .filter(|(_, &size)| size > min_size)
        .map(|(path, &size)| ScanNode {
            path: path.to_string_lossy().into_owned(),
            name: file_name_of(path),
            size,
            is_dir: false,
            children: None,
            is_aggregate: false,
        })
        .collect();

    results.sort_by_key(|n| std::cmp::Reverse(n.size));
    Ok(results)
}

#[tauri::command]
fn get_ai_cache_files(state: tauri::State<ScanState>) -> Result<Vec<ScanNode>, String> {
    let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
    let index = guard.as_ref().ok_or_else(|| "No scan data available. Please run a scan first.".to_string())?;

    let mut results: Vec<ScanNode> = index
        .sizes
        .iter()
        .filter(|(p, _)| is_ai_cache_path(&p.to_string_lossy().to_lowercase()))
        .map(|(path, &size)| ScanNode {
            path: path.to_string_lossy().into_owned(),
            name: file_name_of(path),
            size,
            is_dir: false,
            children: None,
            is_aggregate: false,
        })
        .collect();

    results.sort_by_key(|n| std::cmp::Reverse(n.size));
    Ok(results)
}

#[tauri::command]
fn get_leftover_candidates(state: tauri::State<ScanState>, installed_apps: Vec<String>) -> Result<Vec<ScanNode>, String> {
    let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
    let index = guard.as_ref().ok_or_else(|| "No scan data available. Please run a scan first.".to_string())?;

    let installed_lower: Vec<String> = installed_apps.iter().map(|a| a.to_lowercase()).collect();

    let mut results: Vec<ScanNode> = index
        .sizes
        .iter()
        .filter_map(|(path, &size)| {
            let path_str = path.to_string_lossy();
            let lower = path_str.to_lowercase();
            if lower.contains("/com.apple.") {
                return None;
            }
            if !path_str.contains("Library/Application Support") && !path_str.contains("Library/Caches") {
                return None;
            }
            let app_name = path_str.split('/').find(|p| p.contains(".app") || p.contains("com."))?;
            let app_lower = app_name.to_lowercase();
            if installed_lower.iter().any(|a| a.contains(&app_lower)) {
                return None;
            }
            Some(ScanNode {
                path: path_str.into_owned(),
                name: file_name_of(path),
                size,
                is_dir: false,
                children: None,
                is_aggregate: false,
            })
        })
        .collect();

    results.sort_by_key(|n| std::cmp::Reverse(n.size));
    Ok(results)
}

#[tauri::command]
fn search_files(state: tauri::State<ScanState>, query: String, limit: usize) -> Result<Vec<ScanNode>, String> {
    let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
    let index = guard.as_ref().ok_or_else(|| "No scan data available. Please run a scan first.".to_string())?;

    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }

    const SCAN_CAP: usize = 5000;
    let mut matches: Vec<ScanNode> = Vec::new();

    for (path, &size) in index.sizes.iter() {
        if matches.len() >= SCAN_CAP {
            break;
        }
        let name = file_name_of(path);
        if name.to_lowercase().contains(&q) {
            matches.push(ScanNode {
                path: path.to_string_lossy().into_owned(),
                name,
                size,
                is_dir: false,
                children: None,
                is_aggregate: false,
            });
        }
    }

    for path in index.dirs.iter() {
        if matches.len() >= SCAN_CAP {
            break;
        }
        let name = file_name_of(path);
        if name.to_lowercase().contains(&q) {
            matches.push(ScanNode {
                path: path.to_string_lossy().into_owned(),
                name,
                size: *index.dir_sizes.get(path).unwrap_or(&0),
                is_dir: true,
                children: None,
                is_aggregate: false,
            });
        }
    }

    matches.sort_by_key(|n| std::cmp::Reverse(n.size));
    matches.truncate(limit);
    Ok(matches)
}

#[tauri::command]
async fn find_duplicates(app_handle: tauri::AppHandle, min_size: u64) -> Result<Vec<DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use rayon::prelude::*;
        use std::fs::File;
        use std::io::{BufReader, Read};
        use xxhash_rust::xxh3::{xxh3_64, Xxh3};

        let size_groups: Vec<(u64, Vec<String>)> = {
            let state = app_handle.state::<ScanState>();
            let guard = state.0.lock().map_err(|_| "Scan lock poisoned".to_string())?;
            let index = match guard.as_ref() {
                Some(idx) => idx,
                None => return Err("No scan data available. Please run a scan first.".to_string()),
            };

            let mut size_map: HashMap<u64, Vec<String>> = HashMap::new();
            for (path, &size) in index.sizes.iter() {
                if size >= min_size {
                    size_map.entry(size).or_default().push(path.to_string_lossy().into_owned());
                }
            }
            size_map.into_iter().filter(|(_, v)| v.len() > 1).collect()
        };

        // Independent per-group I/O + hashing -- exactly the kind of work
        // that benefits from running across all cores instead of one thread.
        let results: Vec<DuplicateGroup> = size_groups
            .into_par_iter()
            .flat_map(|(size, paths)| {
                let mut quick_hash_map: HashMap<u64, Vec<String>> = HashMap::new();
                for path in paths {
                    if let Ok(mut file) = File::open(&path) {
                        let mut buffer = [0u8; 4096];
                        let bytes_read = file.read(&mut buffer).unwrap_or(0);
                        let hash = xxh3_64(&buffer[..bytes_read]);
                        quick_hash_map.entry(hash).or_default().push(path);
                    }
                }

                let mut group_results = Vec::new();
                for (_, candidate_paths) in quick_hash_map {
                    if candidate_paths.len() < 2 {
                        continue;
                    }
                    let mut full_hash_map: HashMap<u64, Vec<String>> = HashMap::new();
                    for path in candidate_paths {
                        if let Ok(file) = File::open(&path) {
                            let mut reader = BufReader::with_capacity(8192, file);
                            let mut hasher = Xxh3::new();
                            let mut buffer = [0u8; 8192];
                            loop {
                                match reader.read(&mut buffer) {
                                    Ok(0) => break,
                                    Ok(n) => hasher.update(&buffer[..n]),
                                    Err(_) => break,
                                }
                            }
                            full_hash_map.entry(hasher.digest()).or_default().push(path);
                        }
                    }
                    for (_, full_paths) in full_hash_map {
                        if full_paths.len() > 1 {
                            group_results.push(DuplicateGroup { size, paths: full_paths });
                        }
                    }
                }
                group_results
            })
            .collect();

        Ok(results)
    })
    .await
    .unwrap_or_else(|_| Err("Background task failed".to_string()))
}

#[tauri::command]
fn get_license_state() -> LicenseState {
    current_license_state()
}

#[tauri::command]
fn open_checkout_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://checkout.dodopayments.com/") {
        return Err("Invalid checkout URL. Configure VITE_DODO_CHECKOUT_URL with a Dodo checkout URL.".into());
    }
    Command::new("open").arg(url).status().map_err(|e| e.to_string()).and_then(|status| {
        if status.success() { Ok(()) } else { Err("Could not open the checkout in your browser.".into()) }
    })
}

#[tauri::command]
fn activate_license(key: String) -> Result<LicenseState, String> {
    let key = key.trim().to_string();
    if key.is_empty() { return Err("Enter the license key from your Dodo Payments receipt.".into()); }
    let response = public_license_request("/licenses/activate", json!({
        "license_key": key,
        "name": format!("Reclaim on {}", machine_id()),
    }))?;
    let instance_id = response.get("id").and_then(|v| v.as_str()).map(str::to_string)
        .or_else(|| response.get("license_key_instance_id").and_then(|v| v.as_str()).map(str::to_string));
    let stored = StoredLicense { key: key.clone(), instance_id, last_validated_at: Some(now_secs()), consecutive_failures: 0 };
    keychain_write(&stored)?;
    Ok(current_license_state())
}

#[tauri::command]
fn validate_license() -> Result<LicenseState, String> {
    let mut stored = keychain_read().ok_or_else(|| "No license is activated.".to_string())?;
    let response = public_license_request("/licenses/validate", json!({
        "license_key": stored.key.clone(),
        "license_key_instance_id": stored.instance_id,
    }));
    match response {
        Ok(value) if value.get("valid").and_then(|v| v.as_bool()).unwrap_or(false) => {
            stored.last_validated_at = Some(now_secs());
            stored.consecutive_failures = 0;
            keychain_write(&stored)?;
            Ok(current_license_state())
        }
        Ok(_) => Err("This license is no longer valid.".into()),
        Err(error) => {
            stored.consecutive_failures = stored.consecutive_failures.saturating_add(1);
            let _ = keychain_write(&stored);
            if stored.consecutive_failures < 2 { Ok(current_license_state()) } else { Err(error) }
        }
    }
}

#[tauri::command]
fn deactivate_license() -> Result<(), String> {
    let stored = keychain_read().ok_or_else(|| "No license is activated.".to_string())?;
    if let Some(instance_id) = stored.instance_id {
        let _ = public_license_request("/licenses/deactivate", json!({
            "license_key": stored.key,
            "license_key_instance_id": instance_id,
        }));
    }
    let status = Command::new("security").args(["delete-generic-password", "-s", LICENSE_SERVICE]).status().map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Unable to remove the license from Keychain".into()) }
}

#[tauri::command]
fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "/".to_string())
}

#[tauri::command]
async fn reveal_in_finder(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status();
        match status {
            Ok(_) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .unwrap_or_else(|_| Err("Reveal task failed".to_string()))
}

#[tauri::command]
async fn move_to_trash(paths: Vec<String>) -> Result<(), String> {
    require_license()?;
    tauri::async_runtime::spawn_blocking(move || {
        for path in paths {
            if is_protected_path(&path) {
                let err = format!("Access Denied: '{}' is a protected macOS system path and cannot be deleted.", path);
                eprintln!("{}", err);
                return Err(err);
            }

            if let Err(e) = trash::delete(&path) {
                eprintln!("Failed to move to trash: {} - {}", path, e);
                return Err(e.to_string());
            }
        }
        Ok(())
    })
    .await
    .unwrap_or_else(|_| Err("Trash task failed".to_string()))
}

#[tauri::command]
async fn get_installed_apps() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut apps = Vec::new();
        let dirs_to_check = vec![
            "/Applications",
            "/System/Applications",
        ];

        for dir in dirs_to_check {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.ends_with(".app") {
                                apps.push(name.replace(".app", "").to_lowercase());
                            }
                        }
                    }
                }
            }
        }

        // Also check user's Applications folder
        if let Some(mut home_dir) = dirs::home_dir() {
            home_dir.push("Applications");
            if let Ok(entries) = std::fs::read_dir(home_dir) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.ends_with(".app") {
                                apps.push(name.replace(".app", "").to_lowercase());
                            }
                        }
                    }
                }
            }
        }

        Ok(apps)
    })
    .await
    .unwrap_or_else(|_| Err("App fetch task failed".to_string()))
}

#[derive(Serialize)]
struct DeleteReport {
    deleted_paths: Vec<String>,
    total_size: u64,
}

#[tauri::command]
async fn uninstall_app(app_path: String) -> Result<DeleteReport, String> {
    require_license()?;
    // Stub implementation for uninstaller
    println!("Uninstalling app: {}", app_path);
    Ok(DeleteReport {
        deleted_paths: vec![app_path],
        total_size: 0,
    })
}

#[derive(Serialize)]
struct OrphanedLeftover {
    path: String,
    size: u64,
}

#[tauri::command]
async fn find_orphaned_leftovers() -> Result<Vec<OrphanedLeftover>, String> {
    require_license()?;
    // Stub implementation for orphaned leftovers detection
    Ok(vec![])
}

#[tauri::command]
fn check_fda_status() -> bool {
    if let Some(mut path) = dirs::home_dir() {
        // TCC.db is strictly protected by macOS Full Disk Access
        path.push("Library/Application Support/com.apple.TCC/TCC.db");
        match std::fs::metadata(&path) {
            Ok(_) => true,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    false
                } else {
                    // If it doesn't exist or another error, we assume false to be safe,
                    // though on modern macOS it should always exist.
                    false
                }
            }
        }
    } else {
        true
    }
}

#[tauri::command]
fn open_fda_settings() {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .ok();
}

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    mount_point: String,
    total_bytes: u64,
    used_bytes: u64,
    free_bytes: u64,
    fs_type: String,
    is_removable: bool,
}

#[derive(Serialize)]
struct SystemInfo {
    disks: Vec<DiskInfo>,
    total_ram: u64,
    used_ram: u64,
    cpu_name: String,
    cpu_cores: usize,
    os_name: String,
    os_version: String,
    hostname: String,
    uptime: u64,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    use sysinfo::{Disks, System};

    // Targeted refreshes only -- refresh_all() also enumerates every running
    // process, which is slow (especially on macOS) and entirely unused here.
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let disks_info: Vec<DiskInfo> = Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            mount_point: d.mount_point().to_string_lossy().to_string(),
            total_bytes: d.total_space(),
            used_bytes: d.total_space() - d.available_space(),
            free_bytes: d.available_space(),
            fs_type: d.file_system().to_string_lossy().to_string(),
            is_removable: d.is_removable(),
        })
        .collect();

    SystemInfo {
        disks: disks_info,
        total_ram: sys.total_memory(),
        used_ram: sys.used_memory(),
        cpu_name: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        cpu_cores: sys.cpus().len(),
        os_name: System::name().unwrap_or_default(),
        os_version: System::os_version().unwrap_or_default(),
        hostname: System::host_name().unwrap_or_default(),
        uptime: System::uptime(),
    }
}

#[derive(Serialize)]
struct DevDirectory {
    path: String,
    name: String,
    size: u64,
    category: String,
}

#[tauri::command]
async fn find_dev_directories(path: String) -> Result<Vec<DevDirectory>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::new();

        for entry in jwalk::WalkDir::new(&path)
            .skip_hidden(false)
            .process_read_dir(|_depth, _path, _read_dir_state, children| {
                // Prune descent into any directory that matches one of our
                // targets (node_modules, .venv, target, ...): the dedicated
                // re-walk below sums its size separately, so without this
                // every file inside it would otherwise be visited twice.
                for child_result in children.iter_mut() {
                    if let Ok(child) = child_result {
                        if !child.file_type().is_dir() {
                            continue;
                        }
                        let dir_name = child.file_name().to_string_lossy().to_string();
                        let is_rust_target = dir_name == "target"
                            && child.path().parent().map(|p| p.join("Cargo.toml").exists()).unwrap_or(false);
                        let is_target = is_rust_target || DEV_DIR_TARGETS.iter().any(|(name, _)| *name == dir_name);
                        if is_target {
                            child.read_children = None;
                        }
                    }
                }
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if !entry.file_type().is_dir() { continue; }

            let dir_name = entry.file_name().to_string_lossy().to_string();
            let dir_path_str = entry.path().to_string_lossy().to_string();

            let dominated = results.iter().any(|r: &DevDirectory| dir_path_str.starts_with(&r.path));
            if dominated { continue; }

            let category = if dir_name == "target" {
                entry.path().parent()
                    .and_then(|p| if p.join("Cargo.toml").exists() { Some("Rust Targets") } else { None })
            } else {
                DEV_DIR_TARGETS.iter().find(|(name, _)| *name == dir_name).map(|(_, cat)| *cat)
            };

            if let Some(cat) = category {
                let size: u64 = jwalk::WalkDir::new(entry.path())
                    .skip_hidden(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().is_file())
                    .filter_map(|e| e.metadata().ok())
                    .map(|m| m.len())
                    .sum();

                results.push(DevDirectory {
                    path: dir_path_str,
                    name: dir_name,
                    size,
                    category: cat.to_string(),
                });
            }
        }

        results.sort_by(|a, b| b.size.cmp(&a.size));
        Ok(results)
    })
    .await
    .unwrap_or_else(|_| Err("Dev directory scan failed".to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ScanState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            scan_path,
            get_children,
            get_large_files,
            get_ai_cache_files,
            get_leftover_candidates,
            search_files,
            find_duplicates,
            get_license_state,
            open_checkout_url,
            activate_license,
            validate_license,
            deactivate_license,
            get_home_dir,
            reveal_in_finder,
            move_to_trash,
            get_installed_apps,
            uninstall_app,
            find_orphaned_leftovers,
            check_fda_status,
            open_fda_settings,
            get_system_info,
            find_dev_directories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
