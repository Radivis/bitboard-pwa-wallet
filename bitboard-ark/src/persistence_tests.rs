use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistence, JsonPersistenceDb, OperatorIdentity,
    PendingExitDeductionRecord, PendingExitKind, network_label, validate_operator_identity,
};
use bitcoin::Network;
use bitcoin::XOnlyPublicKey;
use std::str::FromStr;

#[test]
fn network_label_maps_bitcoin_networks() {
    assert_eq!(network_label(Network::Bitcoin), "bitcoin");
    assert_eq!(network_label(Network::Signet), "signet");
}

#[test]
fn validate_operator_identity_accepts_matching_identity() {
    let signer = XOnlyPublicKey::from_str(
        "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
    )
    .expect("valid key");
    let stored = OperatorIdentity {
        signer_pk_hex: signer.to_string(),
        network: network_label(Network::Signet),
    };

    assert!(validate_operator_identity(Some(&stored), signer, Network::Signet).is_ok());
    assert!(validate_operator_identity(None, signer, Network::Signet).is_ok());
}

#[test]
fn validate_operator_identity_rejects_signer_mismatch() {
    let stored_signer = XOnlyPublicKey::from_str(
        "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
    )
    .expect("valid stored key");
    let connected_signer = XOnlyPublicKey::from_str(
        "28845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
    )
    .expect("valid connected key");
    let stored = OperatorIdentity {
        signer_pk_hex: stored_signer.to_string(),
        network: network_label(Network::Signet),
    };

    let error = validate_operator_identity(Some(&stored), connected_signer, Network::Signet)
        .expect_err("mismatched signer");
    assert!(error.contains("does not match connected operator"));
}

#[test]
fn validate_operator_identity_rejects_network_mismatch() {
    let signer = XOnlyPublicKey::from_str(
        "18845781f631c48f1c9709e23092067d06837f30aa0cd0544ac887fe91ddd166",
    )
    .expect("valid key");
    let stored = OperatorIdentity {
        signer_pk_hex: signer.to_string(),
        network: network_label(Network::Bitcoin),
    };

    let error = validate_operator_identity(Some(&stored), signer, Network::Signet)
        .expect_err("mismatched network");
    assert!(error.contains("does not match session network"));
}

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

#[test]
fn pending_exit_kind_deserializes_from_lowercase_strings() {
    let json = r#""collaborative""#;
    let kind: PendingExitKind = serde_json::from_str(json).expect("deserialize");
    assert_eq!(kind, PendingExitKind::Collaborative);
}

#[test]
fn upsert_pending_unilateral_replaces_same_outpoint() {
    let db = JsonPersistenceDb::default();
    let txid = "aa".repeat(32);

    db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
        kind: PendingExitKind::Unilateral,
        vtxo_txid: Some(txid.clone()),
        vout: Some(0),
        amount_sats: 100_000,
        started_at: 1,
        baseline_offchain_spendable_sats: None,
    });
    db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
        kind: PendingExitKind::Unilateral,
        vtxo_txid: Some(txid),
        vout: Some(0),
        amount_sats: 180_603,
        started_at: 2,
        baseline_offchain_spendable_sats: None,
    });

    let pending = db.pending_exit_deductions();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].amount_sats, 180_603);
    assert_eq!(pending[0].started_at, 2);
}

#[test]
fn upsert_pending_collaborative_replaces_existing_collaborative_record() {
    let db = JsonPersistenceDb::default();

    db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
        kind: PendingExitKind::Collaborative,
        vtxo_txid: None,
        vout: None,
        amount_sats: 50_000,
        started_at: 1,
        baseline_offchain_spendable_sats: Some(200_000),
    });
    db.upsert_pending_exit_deduction(PendingExitDeductionRecord {
        kind: PendingExitKind::Collaborative,
        vtxo_txid: None,
        vout: None,
        amount_sats: 100_000,
        started_at: 2,
        baseline_offchain_spendable_sats: Some(180_000),
    });

    let pending = db.pending_exit_deductions();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].amount_sats, 100_000);
    assert_eq!(pending[0].baseline_offchain_spendable_sats, Some(180_000));
}
