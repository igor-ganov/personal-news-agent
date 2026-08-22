/// The shell around the web app.
///
/// The one thing the WebView cannot do for itself is passkeys: on Android they
/// live in the system credential manager, which is reachable only from native
/// code. Everything else still happens in the WebView.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_passkeys::init())
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
