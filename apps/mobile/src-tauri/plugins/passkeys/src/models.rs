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
    /// Ответить тем, что уже есть, и не открывать окно, если ключа нет.
    ///
    /// Поле обязано жить и здесь: структура — это и есть контракт между JS и
    /// Kotlin, и всё, чего в ней нет, молча теряется по дороге.
    #[serde(default)]
    pub immediate: bool,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Контракт между JS и Kotlin проходит через эту структуру целиком: то,
    /// чего в ней нет, теряется молча — так уже терялся флаг тихой проверки.
    #[test]
    fn keeps_the_immediate_flag_in_both_directions() {
        let parsed: RequestJson =
            serde_json::from_str(r#"{"requestJson":"{}","immediate":true}"#).unwrap();
        assert!(parsed.immediate);

        let sent = serde_json::to_string(&parsed).unwrap();
        assert!(sent.contains("\"immediate\":true"), "{sent}");
    }

    #[test]
    fn defaults_to_the_full_dialog() {
        let parsed: RequestJson = serde_json::from_str(r#"{"requestJson":"{}"}"#).unwrap();
        assert!(!parsed.immediate);
    }
}
