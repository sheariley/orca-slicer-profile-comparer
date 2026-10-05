// Keep Rust minimal: the app's logic lives in TypeScript. Host access goes through Tauri's
// official plugins, scoped in capabilities/.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running the profile comparer");
}
