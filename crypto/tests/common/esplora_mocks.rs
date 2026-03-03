use wiremock::MockServer;

/// Start a fresh `wiremock` mock server to simulate an Esplora API.
/// Phase 5 will add specific mock responses for endpoints such as
/// `/api/address/.../utxo`, `/api/tx`, and `/api/tx` (POST broadcast).
pub async fn start_mock_esplora() -> MockServer {
    MockServer::start().await
}
