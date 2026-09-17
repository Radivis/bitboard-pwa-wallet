use ark_client::indexer_fetch_error_is_transient;

#[test]
fn transient_indexer_fetch_detects_browser_failed_to_fetch() {
    assert!(indexer_fetch_error_is_transient(
        "failed to get VTXOs for addresses: request failed: error in reqwest: Failed to fetch",
    ));
}

#[test]
fn transient_indexer_fetch_detects_reqwest_send_failure() {
    assert!(indexer_fetch_error_is_transient(
        "request failed: error in reqwest: error sending request",
    ));
}

#[test]
fn transient_indexer_fetch_ignores_http_client_errors() {
    assert!(!indexer_fetch_error_is_transient("HTTP 400 Bad Request"));
}

#[test]
fn transient_indexer_fetch_ignores_operation_timeout() {
    assert!(!indexer_fetch_error_is_transient(
        "operation timed out after 30s",
    ));
}
