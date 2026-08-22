/// The shell around the web app.
///
/// There are no custom commands on purpose: the whole application lives in the
/// WebView and talks to the model over HTTPS directly, so the Rust side only
/// has to create the window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
