use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistenceV2, JsonPersistenceDb,
};

#[test]
fn persistence_v2_round_trip_json() {
    let envelope = BitboardArkPersistenceV2::empty();
    let json = serde_json::to_string(&envelope).expect("serialize");
    let (parsed, reset_v1) = BitboardArkPersistenceV2::parse_import(Some(&json));
    assert!(!reset_v1);
    assert_eq!(parsed.version, BITBOARD_ARK_PERSISTENCE_VERSION);
}

#[test]
fn persistence_v1_import_resets() {
    let v1 = r#"{"version":1,"wallet":{},"contract":{}}"#;
    let (parsed, reset_v1) = BitboardArkPersistenceV2::parse_import(Some(v1));
    assert!(reset_v1);
    assert_eq!(parsed.version, BITBOARD_ARK_PERSISTENCE_VERSION);
}

#[test]
fn shared_db_default_snapshot() {
    let db = JsonPersistenceDb::default();
    assert!(db.snapshot().boarding_outputs.is_empty());
}

#[test]
fn persistence_v2_round_trip_offchain_next_derivation_index() {
    let mut envelope = BitboardArkPersistenceV2::empty();
    envelope.wallet_db.offchain_next_derivation_index = 3;
    let json = serde_json::to_string(&envelope).expect("serialize");
    let (parsed, reset_v1) = BitboardArkPersistenceV2::parse_import(Some(&json));
    assert!(!reset_v1);
    assert_eq!(parsed.wallet_db.offchain_next_derivation_index, 3);

    let legacy_json = r#"{"version":2,"engine":"ark-rs","ark_sdk_version":"0.9.2","wallet_db":{"boarding_outputs":[],"secret_keys_by_owner_pk_hex":{}},"swap_storage":{}}"#;
    let (legacy_parsed, _) = BitboardArkPersistenceV2::parse_import(Some(legacy_json));
    assert_eq!(legacy_parsed.wallet_db.offchain_next_derivation_index, 0);
}
