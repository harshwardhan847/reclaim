// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
struct ScanNode {
    path: String,
    name: String,
    size: u64,
    children: Option<Vec<ScanNode>>,
}

fn is_protected_path(path_str: &str) -> bool {
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

    if protected_roots.iter().any(|&p| path_str == p || path_str.starts_with(&format!("{}/", p))) {
        return true;
    }

    if exact_protected.iter().any(|&p| path_str == p) {
        return true;
    }

    if let Some(home) = dirs::home_dir() {
        let user_home = home.to_string_lossy().to_string();
        let user_lib = format!("{}/Library", user_home);
        
        // Prevent deleting entire home directory
        if path_str == user_home {
            return true;
        }
        
        // Prevent deleting exact user Library root (cache/support deletions inside are fine)
        if path_str == user_lib {
            return true;
        }
    }

    false
}

#[tauri::command]
async fn scan_path(window: tauri::Window, path: String, exclusions: Option<Vec<String>>) -> Result<ScanNode, String> {
    let mut path_sizes: HashMap<PathBuf, u64> = HashMap::new();
    let mut dir_children: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    let mut total_scanned_bytes = 0u64;
    let mut total_files = 0u32;
    
    let exclusions_list = exclusions.unwrap_or_default();
    
    for entry in jwalk::WalkDir::new(&path).skip_hidden(false) {
        if let Ok(entry) = entry {
            let current_str = entry.path().to_string_lossy().to_string();
            
            // Skip excluded paths
            if exclusions_list.iter().any(|ex| current_str.starts_with(ex)) {
                continue;
            }

            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let parent = entry.path().parent().map(|p| p.to_path_buf());
            let current = entry.path();
            
            if entry.file_type().is_file() {
                path_sizes.insert(current.clone(), size);
                total_scanned_bytes += size;
                total_files += 1;
            }
            
            if let Some(parent_path) = parent {
                dir_children.entry(parent_path).or_default().push(current.clone());
            }

            // Emit progress every 1000 files to avoid spamming the UI thread
            if total_files % 1000 == 0 {
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
            // Only assign children array if there are children, to optimize JSON and UI
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
}

#[tauri::command]
fn move_to_trash(paths: Vec<String>) -> Result<(), String> {
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
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<String>, String> {
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
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            scan_path, 
            move_to_trash,
            get_installed_apps
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
