use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{Availability, Error, RequestJson, ResponseJson, Result};

const PLUGIN_IDENTIFIER: &str = "dev.ganov.pna.passkeys";

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Passkeys<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PasskeysPlugin")?;
    Ok(Passkeys(handle))
}

/// Тонкая обёртка над Kotlin-стороной: вся работа с ключами происходит там.
pub struct Passkeys<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Passkeys<R> {
    pub fn is_available(&self) -> Result<Availability> {
        self.0
            .run_mobile_plugin("isAvailable", ())
            .map_err(|error| Error::Platform(error.to_string()))
    }

    pub fn create(&self, payload: RequestJson) -> Result<ResponseJson> {
        self.call("create", payload)
    }

    pub fn get(&self, payload: RequestJson) -> Result<ResponseJson> {
        self.call("get", payload)
    }

    /// Отмена приходит с кодом в тексте ошибки — интерфейсу важно отличить её
    /// от настоящего сбоя, поэтому она становится отдельным вариантом.
    fn call(&self, command: &str, payload: RequestJson) -> Result<ResponseJson> {
        self.0.run_mobile_plugin(command, payload).map_err(|error| {
            let message = error.to_string();
            if message.contains("NO_CREDENTIAL") {
                Error::NoCredential(message)
            } else if message.contains("CANCELLED") {
                Error::Cancelled(message)
            } else if message.contains("UNSUPPORTED") {
                Error::Unsupported
            } else {
                Error::Platform(message)
            }
        })
    }
}
