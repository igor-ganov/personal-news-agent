use serde::{Deserialize, Serialize};

/// Запрос и ответ ходят как строки JSON.
///
/// Это формат самого WebAuthn: сервер собирает options, менеджер учётных данных
/// принимает их как есть и возвращает ответ в том же виде. Плагину незачем
/// разбирать содержимое — чем меньше он о нём знает, тем меньше может испортить.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestJson {
    pub request_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseJson {
    pub response_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Availability {
    pub available: bool,
}
