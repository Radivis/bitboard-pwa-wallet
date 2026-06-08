use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistence, JsonPersistenceDb, OperatorIdentity,
    network_label,
};
use bitcoin::Network;

#[test]
fn persistence_round_trip_json() {
    let identity = OperatorIdentity {
        signer_pk_hex: "02abc".to_string(),
        network: network_label(Network::Signet),
    };
    let envelope = BitboardArkPersistence::empty(identity.clone());
    let json = serde_json::to_string(&envelope).expect("serialize");
    let parsed = BitboardArkPersistence::parse_import(Some(&json));
    assert_eq!(parsed.operator_identity.as_ref(), Some(&identity));
}

#[test]
fn shared_db_default_snapshot() {
    let db = JsonPersistenceDb::default();
    assert!(db.snapshot().boarding_outputs.is_empty());
}

#[test]
fn persistence_export_version_is_current() {
    let identity = OperatorIdentity {
        signer_pk_hex: "02abc".to_string(),
        network: network_label(Network::Signet),
    };
    let envelope = BitboardArkPersistence::empty(identity);
    assert_eq!(envelope.version, BITBOARD_ARK_PERSISTENCE_VERSION);
}

#[test]
fn persistence_unknown_version_defaults_empty_wallet_db() {
    let legacy_v2_json = r#"{"version":2,"engine":"ark-rs","ark_sdk_version":"0.9.2","wallet_db":{"boarding_outputs":[],"secret_keys_by_owner_pk_hex":{}},"swap_storage":{}}"#;
    let parsed = BitboardArkPersistence::parse_import(Some(legacy_v2_json));
    assert!(parsed.operator_identity.is_none());
    assert_eq!(parsed.wallet_db.offchain_next_derivation_index, 0);
    assert!(parsed.wallet_db.boarding_outputs.is_empty());
}

#[test]
fn persistence_v1_json_defaults_empty_wallet_db() {
    let v1 = r#"{"version":1,"wallet":{},"contract":{}}"#;
    let parsed = BitboardArkPersistence::parse_import(Some(v1));
    assert!(parsed.operator_identity.is_none());
    assert!(parsed.wallet_db.boarding_outputs.is_empty());
}

#[test]
fn persistence_import_export_preserves_offchain_next_derivation_index() {
    let identity = OperatorIdentity {
        signer_pk_hex: "02abc".to_string(),
        network: network_label(Network::Signet),
    };
    let mut envelope = BitboardArkPersistence::empty(identity);
    envelope.wallet_db.offchain_next_derivation_index = 2;

    let json = serde_json::to_string(&envelope).expect("serialize");
    let parsed = BitboardArkPersistence::parse_import(Some(&json));

    assert_eq!(parsed.wallet_db.offchain_next_derivation_index, 2);
}
