//! Ключи доступа средствами платформы.
//!
//! В WebView Android нет WebAuthn — ключами там владеет системный менеджер
//! учётных данных, и добраться до него можно только из нативного кода. Плагин
//! именно это и делает: принимает options от сервера, отдаёт их менеджеру и
//! возвращает подписанный ответ. Закрытый ключ не покидает хранилище устройства.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
mod error;
mod models;

pub use error::{Error, Result};
pub use models::{Availability, RequestJson, ResponseJson};

#[cfg(target_os = "android")]
mod mobile;
#[cfg(not(target_os = "android"))]
mod stub;

#[cfg(target_os = "android")]
use mobile::Passkeys;
#[cfg(not(target_os = "android"))]
use stub::Passkeys;

/// Доступ к плагину из состояния приложения.
pub trait PasskeysExt<R: Runtime> {
    fn passkeys(&self) -> &Passkeys<R>;
}

impl<R: Runtime, T: Manager<R>> PasskeysExt<R> for T {
    fn passkeys(&self) -> &Passkeys<R> {
        self.state::<Passkeys<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("passkeys")
        .invoke_handler(tauri::generate_handler![
            commands::is_available,
            commands::create,
            commands::get
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let passkeys = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let passkeys = stub::init(app, api)?;

            app.manage(passkeys);
            Ok(())
        })
        .build()
}
