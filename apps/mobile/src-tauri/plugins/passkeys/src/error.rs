use serde::{Serialize, Serializer};

/// Ошибки плагина.
///
/// Отмена пользователем — отдельный случай, а не общий сбой: интерфейс должен
/// сказать «вход отменён», а не «что-то пошло не так».
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Ключи доступа недоступны на этом устройстве")]
    Unsupported,
    #[error("{0}")]
    Cancelled(String),
    #[error("{0}")]
    Platform(String),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[cfg(target_os = "android")]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
