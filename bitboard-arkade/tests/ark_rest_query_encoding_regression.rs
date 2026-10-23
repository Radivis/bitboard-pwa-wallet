//! Ensures vendored ark-rest keeps correct OpenAPI simple-array query encoding.

#[test]
fn ark_rest_indexer_vtxos_uses_repeated_query_params_not_csv() {
    let source = include_str!("../../third_party/ark-rest/src/apis/indexer_service_api.rs");
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
fn ark_rest_event_stream_uses_repeated_query_params_not_csv() {
    let source = include_str!("../../third_party/ark-rest/src/apis/ark_service_api.rs");
    assert!(
        source.contains("repeated_simple_query_pairs"),
        "batch events must encode topics via repeated_simple_query_pairs"
    );
    assert!(
        !source.contains("match \"csv\""),
        "ark_service_api must not comma-join query array params"
    );
}
