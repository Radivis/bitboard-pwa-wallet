use crate::persistence::{
    BITBOARD_ARK_PERSISTENCE_VERSION, BitboardArkPersistence, JsonPersistenceDb, OperatorIdentity,
    OperatorSignerMigrationHint, PendingExitDeductionRecord, PendingExitKind, network_label,
    validate_operator_identity,
};
use ark_core::server::{DeprecatedSigner, Info};
use bitcoin::address::NetworkUnchecked;
use bitcoin::secp256k1::PublicKey;
use bitcoin::{Amount, Network, ScriptBuf, XOnlyPublicKey};
use std::collections::HashMap;
use std::str::FromStr;

const PK_CURRENT: &str = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const PK_DEPRECATED: &str = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const PK_UNKNOWN: &str = "030192e796452d6df9697c280542e1560557bcf79a347d925895043136225c7cb4";

fn public_key(hex: &str) -> PublicKey {
    PublicKey::from_str(hex).expect("valid key")
}

fn xonly(hex: &str) -> XOnlyPublicKey {
    public_key(hex).x_only_public_key().0
}

fn test_server_info(current_hex: &str, deprecated: Vec<(&str, i64)>) -> Info {
    let dummy_address: bitcoin::Address<NetworkUnchecked> =
        "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
            .parse()
            .unwrap();
    Info {
        version: "1".into(),
        signer_pk: public_key(current_hex),
        forfeit_pk: public_key(current_hex),
        forfeit_address: dummy_address.assume_checked(),
        checkpoint_tapscript: ScriptBuf::new(),
        network: Network::Signet,
        session_duration: 0,
        unilateral_exit_delay: bitcoin::Sequence::ZERO,
        boarding_exit_delay: bitcoin::Sequence::ZERO,
        utxo_min_amount: None,
        utxo_max_amount: None,
        vtxo_min_amount: None,
        vtxo_max_amount: None,
        dust: Amount::ZERO,
        fees: None,
        scheduled_session: None,
        deprecated_signers: deprecated
            .into_iter()
            .map(|(key, cutoff)| DeprecatedSigner {
                pk: public_key(key),
                cutoff_date: cutoff,
            })
            .collect(),
        service_status: HashMap::new(),
        digest: String::new(),
        max_tx_weight: 0,
        max_op_return_outputs: 0,
    }
}

#[test]
fn network_label_maps_bitcoin_networks() {
    assert_eq!(network_label(Network::Bitcoin), "bitcoin");
    assert_eq!(network_label(Network::Signet), "signet");
}

#[test]
fn validate_operator_identity_accepts_matching_identity() {
    let signer = xonly(PK_CURRENT);
    let stored = OperatorIdentity {
        signer_pk_hex: signer.to_string(),
        network: network_label(Network::Signet),
    };
    let info = test_server_info(PK_CURRENT, vec![]);
    let now = 1_000_000i64;

    assert_eq!(
        validate_operator_identity(Some(&stored), &info, Network::Signet, now),
        Ok(None)
    );
    assert_eq!(
        validate_operator_identity(None, &info, Network::Signet, now),
        Ok(None)
    );
}

#[test]
fn validate_operator_identity_accepts_deprecated_stored_signer() {
    let stored = OperatorIdentity {
        signer_pk_hex: xonly(PK_DEPRECATED).to_string(),
        network: network_label(Network::Signet),
    };
    let info = test_server_info(PK_CURRENT, vec![(PK_DEPRECATED, 2_000_000)]);
    let now = 1_000_000i64;

    let hint = validate_operator_identity(Some(&stored), &info, Network::Signet, now)
        .expect("deprecated signer should open for migration");

    assert_eq!(
        hint,
        Some(OperatorSignerMigrationHint {
            previous_signer_pk_hex: stored.signer_pk_hex.clone(),
            deprecated_status: "migratable".to_string(),
            cutoff_unix: 2_000_000,
        })
    );
}

#[test]
fn validate_operator_identity_accepts_expired_deprecated_signer_for_recovery() {
    let stored = OperatorIdentity {
        signer_pk_hex: xonly(PK_DEPRECATED).to_string(),
        network: network_label(Network::Signet),
    };
    let info = test_server_info(PK_CURRENT, vec![(PK_DEPRECATED, 500_000)]);
    let now = 1_000_000i64;

    let hint = validate_operator_identity(Some(&stored), &info, Network::Signet, now)
        .expect("post-cutoff deprecated signer should still open");

    assert_eq!(
        hint.as_ref().map(|h| h.deprecated_status.as_str()),
        Some("expired")
    );
}

#[test]
fn validate_operator_identity_rejects_unknown_signer() {
    let stored = OperatorIdentity {
        signer_pk_hex: xonly(PK_UNKNOWN).to_string(),
        network: network_label(Network::Signet),
    };
    let info = test_server_info(PK_CURRENT, vec![(PK_DEPRECATED, 2_000_000)]);
    let now = 1_000_000i64;

    let error = validate_operator_identity(Some(&stored), &info, Network::Signet, now)
        .expect_err("unknown signer");
    assert!(error.contains("not recognized by the connected operator"));
    assert!(error.contains("different Arkade service provider"));
}

#[test]
fn validate_operator_identity_rejects_network_mismatch() {
    let signer = xonly(PK_CURRENT);
    let stored = OperatorIdentity {
        signer_pk_hex: signer.to_string(),
        network: network_label(Network::Bitcoin),
    };
    let info = test_server_info(PK_CURRENT, vec![]);

    let error = validate_operator_identity(Some(&stored), &info, Network::Signet, 0)
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
