use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistenceV2, BitboardArkPersistenceV3,
    JsonPersistenceDb, OperatorIdentity, network_label,
};
use bitcoin::Network;

#[test]
fn persistence_v3_round_trip_json() {
    let identity = OperatorIdentity {
        signer_pk_hex: "02abc".to_string(),
        network: network_label(Network::Signet),
    };
    let envelope = BitboardArkPersistenceV3::empty(identity.clone());
    let json = serde_json::to_string(&envelope).expect("serialize");
    let parsed = BitboardArkPersistenceV3::parse_import(Some(&json));
    assert!(!parsed.reset_v1);
    assert_eq!(parsed.operator_identity.as_ref(), Some(&identity));
}

#[test]
fn persistence_v1_import_resets() {
    let v1 = r#"{"version":1,"wallet":{},"contract":{}}"#;
    let parsed = BitboardArkPersistenceV3::parse_import(Some(v1));
    assert!(parsed.reset_v1);
}

#[test]
fn shared_db_default_snapshot() {
    let db = JsonPersistenceDb::default();
    assert!(db.snapshot().boarding_outputs.is_empty());
}

#[test]
fn persistence_v2_import_uplifts_without_identity() {
    let mut envelope = BitboardArkPersistenceV2::empty();
    envelope.wallet_db.offchain_next_derivation_index = 3;
    let json = serde_json::to_string(&envelope).expect("serialize");
    let parsed = BitboardArkPersistenceV3::parse_import(Some(&json));
    assert!(!parsed.reset_v1);
    assert_eq!(parsed.wallet_db.offchain_next_derivation_index, 3);
    assert!(parsed.operator_identity.is_none());

    let legacy_json = r#"{"version":2,"engine":"ark-rs","ark_sdk_version":"0.9.2","wallet_db":{"boarding_outputs":[],"secret_keys_by_owner_pk_hex":{}},"swap_storage":{}}"#;
    let legacy_parsed = BitboardArkPersistenceV3::parse_import(Some(legacy_json));
    assert_eq!(legacy_parsed.wallet_db.offchain_next_derivation_index, 0);
}

#[test]
fn persistence_v3_export_version_is_current() {
    let identity = OperatorIdentity {
        signer_pk_hex: "02abc".to_string(),
        network: network_label(Network::Signet),
    };
    let envelope = BitboardArkPersistenceV3::empty(identity);
    assert_eq!(envelope.version, BITBOARD_ARK_PERSISTENCE_VERSION);
}
