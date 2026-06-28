//! Guards against openapi-generator regressions that comma-join simple-style query arrays.

#[test]
fn indexer_get_vtxos_uses_repeated_query_params_not_csv() {
    let source = include_str!("../src/apis/indexer_service_api.rs");
    assert!(
        source.contains("repeated_simple_query_pairs"),
        "indexer vtxos must encode scripts/outpoints via repeated_simple_query_pairs"
    );
    assert!(
        !source.contains("match \"csv\""),
        "indexer_service_api must not comma-join query array params"
    );
}

#[test]
fn ark_get_event_stream_uses_repeated_query_params_not_csv() {
    let source = include_str!("../src/apis/ark_service_api.rs");
    assert!(
        source.contains("repeated_simple_query_pairs"),
        "batch events must encode topics via repeated_simple_query_pairs"
    );
    assert!(
        !source.contains("match \"csv\""),
        "ark_service_api must not comma-join query array params"
    );
}

#[test]
fn virtual_tx_path_txids_may_use_comma_in_path_segment() {
    let source = include_str!("../src/apis/indexer_service_api.rs");
    assert!(
        source.contains("/v1/indexer/virtualTx/{txids}"),
        "virtual tx lookup uses path-segment txid list"
    );
    assert!(
        source.contains("Path-segment array"),
        "document why comma join is intentional for virtualTx path param"
    );
}
