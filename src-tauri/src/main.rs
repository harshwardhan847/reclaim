// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use jwalk::WalkDirGeneric;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
struct ScanNode {
    path: String,
    name: String,
    size: u64,
    children: Option<Vec<ScanNode>>,
}

#[tauri::command]
fn scan_path(path: String) -> Result<ScanNode, String> {
    // This is a simplified version of the scanning logic
    // For a real app, this should be async, handle APFS clones, and use events to report progress
    let mut total_size = 0;
    
    // Simplistic mock response to get the UI wired up quickly
    // jwalk could be used here to build the actual tree
    
    // In this basic version we will just return a mocked tree for the UI testing
    Ok(ScanNode {
        path: path.clone(),
        name: Path::new(&path).file_name().unwrap_or_default().to_string_lossy().to_string(),
        size: 15_000_000_000,
        children: Some(vec![
            ScanNode {
                path: format!("{}/Apps", path),
                name: "Apps".to_string(),
                size: 8_000_000_000,
                children: None,
            },
            ScanNode {
                path: format!("{}/Documents", path),
                name: "Documents".to_string(),
                size: 5_000_000_000,
                children: None,
            },
            ScanNode {
                path: format!("{}/Media", path),
                name: "Media".to_string(),
                size: 2_000_000_000,
                children: None,
            },
        ])
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![scan_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
