// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ScanNode {
    path: String,
    name: String,
    size: u64,
    children: Option<Vec<ScanNode>>,
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

#[tauri::command]
async fn scan_path(window: tauri::Window, path: String, exclusions: Option<Vec<String>>) -> Result<ScanNode, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut path_sizes: HashMap<PathBuf, u64> = HashMap::new();
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
                
                if entry.file_type().is_file() {
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    path_sizes.insert(current.clone(), size);
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

        // Now recursively build the tree
        fn build_tree(current: &Path, sizes: &HashMap<PathBuf, u64>, children_map: &HashMap<PathBuf, Vec<PathBuf>>) -> ScanNode {
            let name = current.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let path_str = current.to_string_lossy().into_owned();
            
            let mut node = ScanNode {
                path: path_str,
                name,
                size: 0,
                children: None,
            };

            if let Some(children) = children_map.get(current) {
                let mut child_nodes = Vec::new();
                let mut total_size = 0;
                
                for child in children {
                    let child_node = build_tree(child, sizes, children_map);
                    total_size += child_node.size;
                    child_nodes.push(child_node);
                }
                
                node.size = total_size;
                if !child_nodes.is_empty() {
                    node.children = Some(child_nodes);
                }
            } else {
                node.size = *sizes.get(current).unwrap_or(&0);
            }
            
            node
        }
        
        let tree = build_tree(Path::new(&path), &path_sizes, &dir_children);
        Ok(tree)
    })
    .await
    .unwrap_or_else(|_| Err("Scan panicked".to_string()))
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

#[tauri::command]
async fn find_true_duplicates(size_groups: Vec<Vec<String>>) -> Result<Vec<Vec<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::collections::HashMap;
        use std::fs::File;
        use std::io::{BufReader, Read};
        use xxhash_rust::xxh3::{xxh3_64, Xxh3};

        let mut true_duplicates = Vec::new();

        for group in size_groups {
            if group.len() < 2 {
                continue;
            }

            let mut quick_hash_map: HashMap<u64, Vec<String>> = HashMap::new();

            for path in group {
                if let Ok(mut file) = File::open(&path) {
                    let mut buffer = [0; 4096];
                    let bytes_read = file.read(&mut buffer).unwrap_or(0);
                    let hash = xxh3_64(&buffer[..bytes_read]);
                    quick_hash_map.entry(hash).or_default().push(path);
                }
            }

            for (_, paths) in quick_hash_map {
                if paths.len() > 1 {
                    let mut full_hash_map: HashMap<u64, Vec<String>> = HashMap::new();
                    for path in paths {
                        if let Ok(file) = File::open(&path) {
                            let mut reader = BufReader::with_capacity(8192, file);
                            let mut hasher = Xxh3::new();
                            let mut buffer = [0; 8192];
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
                            true_duplicates.push(full_paths);
                        }
                    }
                }
            }
        }

        Ok(true_duplicates)
    })
    .await
    .unwrap_or_else(|_| Err("Background task failed".to_string()))
}

#[derive(Serialize)]
struct DeleteReport {
    deleted_paths: Vec<String>,
    total_size: u64,
}

#[tauri::command]
async fn uninstall_app(app_path: String) -> Result<DeleteReport, String> {
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
    
    let mut sys = System::new_all();
    sys.refresh_all();
    
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
        
        let targets: &[(&str, &str)] = &[
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
        
        for entry in jwalk::WalkDir::new(&path).skip_hidden(false) {
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
                targets.iter().find(|(name, _)| *name == dir_name).map(|(_, cat)| *cat)
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
        .invoke_handler(tauri::generate_handler![
            scan_path, 
            get_home_dir,
            reveal_in_finder,
            move_to_trash,
            get_installed_apps,
            find_true_duplicates,
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
