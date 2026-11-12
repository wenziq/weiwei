use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    version: String,
    api_base_url: String,
    platform: String,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        api_base_url: std::env::var("WEIWEI_API_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8000/api/v1".to_string()),
        platform: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_info, toggle_fullscreen])
        .run(tauri::generate_context!())
        .expect("failed to run 危微 desktop application");
}
