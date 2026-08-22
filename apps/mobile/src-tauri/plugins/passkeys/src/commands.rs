use tauri::{command, AppHandle, Runtime};

use crate::{Availability, PasskeysExt, RequestJson, ResponseJson, Result};

#[command]
pub(crate) async fn is_available<R: Runtime>(app: AppHandle<R>) -> Result<Availability> {
    app.passkeys().is_available()
}

#[command]
pub(crate) async fn create<R: Runtime>(
    app: AppHandle<R>,
    payload: RequestJson,
) -> Result<ResponseJson> {
    app.passkeys().create(payload)
}

#[command]
pub(crate) async fn get<R: Runtime>(
    app: AppHandle<R>,
    payload: RequestJson,
) -> Result<ResponseJson> {
    app.passkeys().get(payload)
}
