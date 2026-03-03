use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

pub async fn start_mock_esplora() -> MockServer {
    MockServer::start().await
}

/// Mount a mock that accepts broadcast POSTs and returns the given txid.
pub async fn mock_broadcast_success(server: &MockServer, txid_hex: &str) {
    Mock::given(method("POST"))
        .and(path("/tx"))
        .respond_with(ResponseTemplate::new(200).set_body_string(txid_hex))
        .mount(server)
        .await;
}

/// Mount a mock that rejects broadcast POSTs with a 400 error.
pub async fn mock_broadcast_rejection(server: &MockServer, error_message: &str) {
    Mock::given(method("POST"))
        .and(path("/tx"))
        .respond_with(ResponseTemplate::new(400).set_body_string(error_message))
        .mount(server)
        .await;
}
