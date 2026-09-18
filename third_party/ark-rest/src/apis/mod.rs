use std::error;
use std::fmt;

/// Max response body chars included in user-facing HTTP error strings.
const RESPONSE_ERROR_BODY_SNIPPET_MAX_LEN: usize = 256;

#[derive(Debug, Clone)]
pub struct ResponseContent<T> {
    pub status: reqwest::StatusCode,
    pub content: String,
    pub entity: Option<T>,
}

#[derive(Debug)]
pub enum Error<T> {
    Reqwest(reqwest::Error),
    Serde(serde_json::Error),
    Io(std::io::Error),
    ResponseError(ResponseContent<T>),
}

/// Collapse whitespace and cap length for operator error bodies shown in UI chains.
pub(crate) fn truncate_response_error_body(content: &str) -> String {
    let collapsed = content.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.len() <= RESPONSE_ERROR_BODY_SNIPPET_MAX_LEN {
        return collapsed;
    }
    format!(
        "{}…",
        &collapsed[..RESPONSE_ERROR_BODY_SNIPPET_MAX_LEN.saturating_sub(1)]
    )
}

fn format_response_error_display<T>(response: &ResponseContent<T>) -> String {
    let body_snippet = truncate_response_error_body(&response.content);
    if body_snippet.is_empty() {
        format!("status code {}", response.status)
    } else {
        format!("status code {}: {}", response.status, body_snippet)
    }
}

impl<T> fmt::Display for Error<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (module, e) = match self {
            Error::Reqwest(e) => ("reqwest", e.to_string()),
            Error::Serde(e) => ("serde", e.to_string()),
            Error::Io(e) => ("IO", e.to_string()),
            Error::ResponseError(response) => {
                ("response", format_response_error_display(response))
            }
        };
        write!(f, "error in {}: {}", module, e)
    }
}

impl<T: fmt::Debug> error::Error for Error<T> {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        Some(match self {
            Error::Reqwest(e) => e,
            Error::Serde(e) => e,
            Error::Io(e) => e,
            Error::ResponseError(_) => return None,
        })
    }
}

impl<T> From<reqwest::Error> for Error<T> {
    fn from(e: reqwest::Error) -> Self {
        Error::Reqwest(e)
    }
}

impl<T> From<serde_json::Error> for Error<T> {
    fn from(e: serde_json::Error) -> Self {
        Error::Serde(e)
    }
}

impl<T> From<std::io::Error> for Error<T> {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

pub fn urlencode<T: AsRef<str>>(s: T) -> String {
    ::url::form_urlencoded::byte_serialize(s.as_ref().as_bytes()).collect()
}

pub fn parse_deep_object(prefix: &str, value: &serde_json::Value) -> Vec<(String, String)> {
    if let serde_json::Value::Object(object) = value {
        let mut params = vec![];

        for (key, value) in object {
            match value {
                serde_json::Value::Object(_) => params.append(&mut parse_deep_object(
                    &format!("{}[{}]", prefix, key),
                    value,
                )),
                serde_json::Value::Array(array) => {
                    for (i, value) in array.iter().enumerate() {
                        params.append(&mut parse_deep_object(
                            &format!("{}[{}][{}]", prefix, key, i),
                            value,
                        ));
                    }
                }
                serde_json::Value::String(s) => {
                    params.push((format!("{}[{}]", prefix, key), s.clone()))
                }
                _ => params.push((format!("{}[{}]", prefix, key), value.to_string())),
            }
        }

        return params;
    }

    unimplemented!("Only objects are supported with style=deepObject")
}

/// Internal use only
/// A content type supported by this client.
#[allow(dead_code)]
enum ContentType {
    Json,
    Text,
    Unsupported(String),
}

impl From<&str> for ContentType {
    fn from(content_type: &str) -> Self {
        if content_type.starts_with("application") && content_type.contains("json") {
            return Self::Json;
        } else if content_type.starts_with("text/plain") {
            return Self::Text;
        } else {
            return Self::Unsupported(content_type.to_string());
        }
    }
}

pub mod ark_service_api;
pub mod indexer_service_api;
pub mod signer_manager_service_api;
pub mod wallet_initializer_service_api;
pub mod wallet_service_api;

pub mod configuration;

#[cfg(test)]
mod display_tests {
    use super::*;

    #[test]
    fn response_error_display_includes_status_and_body_snippet() {
        let error = Error::<()>::ResponseError(ResponseContent {
            status: reqwest::StatusCode::BAD_REQUEST,
            content: r#"{"code":"INVALID_ARGUMENT","message":"duplicated input"}"#.to_string(),
            entity: None,
        });
        let display = error.to_string();
        assert!(display.contains("status code 400"));
        assert!(display.contains("duplicated input"));
    }

    #[test]
    fn truncate_response_error_body_collapses_whitespace_and_caps_length() {
        let long_body = "a".repeat(250);
        let truncated = truncate_response_error_body(&format!("line1\n\n  {long_body}"));
        assert!(truncated.len() <= RESPONSE_ERROR_BODY_SNIPPET_MAX_LEN);
        assert!(!truncated.contains('\n'));
    }
}
