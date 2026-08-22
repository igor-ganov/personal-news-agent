use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{Availability, Error, RequestJson, ResponseJson, Result};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Passkeys<R>> {
    Ok(Passkeys(std::marker::PhantomData))
}

/// На десктопе ключами владеет сам WebView — плагин здесь только честно
/// сообщает, что ему нечего предложить, чтобы клиент выбрал браузерный путь.
pub struct Passkeys<R: Runtime>(std::marker::PhantomData<R>);

impl<R: Runtime> Passkeys<R> {
    pub fn is_available(&self) -> Result<Availability> {
        Ok(Availability { available: false })
    }

    pub fn create(&self, _payload: RequestJson) -> Result<ResponseJson> {
        Err(Error::Unsupported)
    }

    pub fn get(&self, _payload: RequestJson) -> Result<ResponseJson> {
        Err(Error::Unsupported)
    }
}
