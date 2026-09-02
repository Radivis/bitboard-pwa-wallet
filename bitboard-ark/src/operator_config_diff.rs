use crate::api_types::OperatorConfigDiffEntryDto;
use crate::cached_operator_info::CachedOperatorInfoRecord;
use serde::Serialize;

fn push_if_changed(
    entries: &mut Vec<OperatorConfigDiffEntryDto>,
    field_key: &str,
    field_label: &str,
    accepted: &str,
    pending: &str,
) {
    if accepted != pending {
        entries.push(OperatorConfigDiffEntryDto {
            field_key: field_key.to_string(),
            field_label: field_label.to_string(),
            accepted_value: accepted.to_string(),
            pending_value: pending.to_string(),
        });
    }
}

fn push_option_u64(
    entries: &mut Vec<OperatorConfigDiffEntryDto>,
    field_key: &str,
    field_label: &str,
    accepted: Option<u64>,
    pending: Option<u64>,
) {
    let accepted_text = accepted
        .map(|value| value.to_string())
        .unwrap_or_else(|| "—".to_string());
    let pending_text = pending
        .map(|value| value.to_string())
        .unwrap_or_else(|| "—".to_string());
    push_if_changed(
        entries,
        field_key,
        field_label,
        &accepted_text,
        &pending_text,
    );
}

fn option_to_json_text<T: Serialize>(value: &Option<T>) -> String {
    match value {
        Some(inner) => serde_json::to_string(inner).unwrap_or_else(|_| "—".to_string()),
        None => "—".to_string(),
    }
}

fn push_option_json_if_changed<T: Serialize>(
    entries: &mut Vec<OperatorConfigDiffEntryDto>,
    field_key: &str,
    field_label: &str,
    accepted: &Option<T>,
    pending: &Option<T>,
) {
    let accepted_text = option_to_json_text(accepted);
    let pending_text = option_to_json_text(pending);
    push_if_changed(
        entries,
        field_key,
        field_label,
        &accepted_text,
        &pending_text,
    );
}

pub fn operator_config_diff(
    accepted: &CachedOperatorInfoRecord,
    pending: &CachedOperatorInfoRecord,
) -> Vec<OperatorConfigDiffEntryDto> {
    let mut entries = Vec::new();

    push_if_changed(
        &mut entries,
        "digest",
        "Config digest",
        &accepted.digest,
        &pending.digest,
    );
    push_if_changed(
        &mut entries,
        "version",
        "Server version",
        &accepted.version,
        &pending.version,
    );
    push_if_changed(
        &mut entries,
        "signer_pk_hex",
        "Operator signer",
        &accepted.signer_pk_hex,
        &pending.signer_pk_hex,
    );
    push_if_changed(
        &mut entries,
        "forfeit_pk_hex",
        "Forfeit key",
        &accepted.forfeit_pk_hex,
        &pending.forfeit_pk_hex,
    );
    push_if_changed(
        &mut entries,
        "forfeit_address",
        "Forfeit address",
        &accepted.forfeit_address,
        &pending.forfeit_address,
    );
    push_if_changed(
        &mut entries,
        "checkpoint_tapscript_hex",
        "Checkpoint tapscript",
        &accepted.checkpoint_tapscript_hex,
        &pending.checkpoint_tapscript_hex,
    );
    push_if_changed(
        &mut entries,
        "network",
        "Network",
        &accepted.network,
        &pending.network,
    );
    push_if_changed(
        &mut entries,
        "session_duration",
        "Session duration (seconds)",
        &accepted.session_duration.to_string(),
        &pending.session_duration.to_string(),
    );
    push_if_changed(
        &mut entries,
        "unilateral_exit_delay_consensus",
        "Unilateral exit delay (blocks)",
        &accepted.unilateral_exit_delay_consensus.to_string(),
        &pending.unilateral_exit_delay_consensus.to_string(),
    );
    push_if_changed(
        &mut entries,
        "boarding_exit_delay_consensus",
        "Boarding exit delay (blocks)",
        &accepted.boarding_exit_delay_consensus.to_string(),
        &pending.boarding_exit_delay_consensus.to_string(),
    );
    push_option_u64(
        &mut entries,
        "utxo_min_amount_sats",
        "UTXO min (sats)",
        accepted.utxo_min_amount_sats,
        pending.utxo_min_amount_sats,
    );
    push_option_u64(
        &mut entries,
        "utxo_max_amount_sats",
        "UTXO max (sats)",
        accepted.utxo_max_amount_sats,
        pending.utxo_max_amount_sats,
    );
    push_option_u64(
        &mut entries,
        "vtxo_min_amount_sats",
        "VTXO min (sats)",
        accepted.vtxo_min_amount_sats,
        pending.vtxo_min_amount_sats,
    );
    push_option_u64(
        &mut entries,
        "vtxo_max_amount_sats",
        "VTXO max (sats)",
        accepted.vtxo_max_amount_sats,
        pending.vtxo_max_amount_sats,
    );
    push_if_changed(
        &mut entries,
        "dust_sats",
        "Dust (sats)",
        &accepted.dust_sats.to_string(),
        &pending.dust_sats.to_string(),
    );
    push_if_changed(
        &mut entries,
        "max_tx_weight",
        "Max transaction weight",
        &accepted.max_tx_weight.to_string(),
        &pending.max_tx_weight.to_string(),
    );
    push_if_changed(
        &mut entries,
        "max_op_return_outputs",
        "Max OP_RETURN outputs",
        &accepted.max_op_return_outputs.to_string(),
        &pending.max_op_return_outputs.to_string(),
    );

    push_option_json_if_changed(
        &mut entries,
        "fees",
        "Fee schedule",
        &accepted.fees,
        &pending.fees,
    );
    push_option_json_if_changed(
        &mut entries,
        "scheduled_session",
        "Operator batch schedule",
        &accepted.scheduled_session,
        &pending.scheduled_session,
    );

    let accepted_deprecated =
        serde_json::to_string(&accepted.deprecated_signers).unwrap_or_else(|_| "[]".to_string());
    let pending_deprecated =
        serde_json::to_string(&pending.deprecated_signers).unwrap_or_else(|_| "[]".to_string());
    push_if_changed(
        &mut entries,
        "deprecated_signers",
        "Deprecated signers",
        &accepted_deprecated,
        &pending_deprecated,
    );

    let accepted_services =
        serde_json::to_string(&accepted.service_status).unwrap_or_else(|_| "{}".to_string());
    let pending_services =
        serde_json::to_string(&pending.service_status).unwrap_or_else(|_| "{}".to_string());
    push_if_changed(
        &mut entries,
        "service_status",
        "Service status",
        &accepted_services,
        &pending_services,
    );

    entries
}

/// Returns true when operator sync must not persist snapshot / accepted cache.
pub fn should_block_sync_persist_for_operator_trust(
    operator_trust_pending: bool,
    accepted: Option<&CachedOperatorInfoRecord>,
    new_digest: &str,
) -> bool {
    if operator_trust_pending {
        return true;
    }
    operator_digest_mismatch(accepted, new_digest)
}

/// Returns true when live server digest differs from the last accepted operator cache.
pub fn operator_digest_mismatch(
    accepted: Option<&CachedOperatorInfoRecord>,
    new_digest: &str,
) -> bool {
    accepted.is_some_and(|cached| cached.digest != new_digest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cached_operator_info::{
        CachedFeeInfoRecord, CachedIntentFeeInfoRecord, CachedScheduledSessionRecord,
    };
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::secp256k1::Secp256k1;
    use bitcoin::{Amount, Network, ScriptBuf, Sequence};
    use std::collections::HashMap;

    fn sample_cached(digest: &str, delay: u32) -> CachedOperatorInfoRecord {
        let secp = Secp256k1::new();
        let signer_sk = bitcoin::secp256k1::SecretKey::from_slice(&[0x11; 32]).unwrap();
        let forfeit_sk = bitcoin::secp256k1::SecretKey::from_slice(&[0x22; 32]).unwrap();
        let signer_pk = PublicKey::from_secret_key(&secp, &signer_sk);
        let forfeit_pk = PublicKey::from_secret_key(&secp, &forfeit_sk);
        let forfeit_address = bitcoin::Address::p2tr(
            &secp,
            bitcoin::key::XOnlyPublicKey::from_slice(&[0x44; 32]).unwrap(),
            None,
            Network::Signet,
        );
        CachedOperatorInfoRecord::from_server_info(&ark_core::server::Info {
            version: "test".to_string(),
            signer_pk,
            forfeit_pk,
            forfeit_address,
            checkpoint_tapscript: ScriptBuf::new(),
            network: Network::Signet,
            session_duration: 600,
            unilateral_exit_delay: Sequence::from_consensus(delay),
            boarding_exit_delay: Sequence::from_consensus(144),
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: Amount::from_sat(330),
            fees: None,
            scheduled_session: None,
            deprecated_signers: vec![],
            service_status: HashMap::new(),
            digest: digest.to_string(),
            max_tx_weight: 400_000,
            max_op_return_outputs: 1,
        })
    }

    #[test]
    fn operator_config_diff_lists_changed_fields() {
        let accepted = sample_cached("digest-a", 144);
        let pending = sample_cached("digest-b", 288);
        let diff = operator_config_diff(&accepted, &pending);
        let keys: Vec<&str> = diff.iter().map(|entry| entry.field_key.as_str()).collect();
        assert!(keys.contains(&"digest"));
        assert!(keys.contains(&"unilateral_exit_delay_consensus"));
    }

    #[test]
    fn operator_config_diff_lists_fees_when_changed() {
        let accepted = sample_cached("digest-a", 144);
        let mut pending = accepted.clone();
        pending.fees = Some(CachedFeeInfoRecord {
            intent_fee: CachedIntentFeeInfoRecord {
                offchain_input: Some("1".to_string()),
                offchain_output: None,
                onchain_input: None,
                onchain_output: None,
            },
            tx_fee_rate: String::new(),
        });
        let diff = operator_config_diff(&accepted, &pending);
        let fees_entry = diff
            .iter()
            .find(|entry| entry.field_key == "fees")
            .expect("fees diff entry");
        assert_eq!(fees_entry.field_label, "Fee schedule");
        assert_eq!(fees_entry.accepted_value, "—");
        assert!(
            fees_entry
                .pending_value
                .contains("\"offchain_input\":\"1\"")
        );
    }

    #[test]
    fn operator_config_diff_lists_scheduled_session_when_changed() {
        let accepted = sample_cached("digest-a", 144);
        let mut pending = accepted.clone();
        pending.scheduled_session = Some(CachedScheduledSessionRecord {
            next_start_time: 1_700_000_000,
            next_end_time: 1_700_001_000,
            period: 3_600,
            duration: 1_000,
            fees: None,
        });
        let diff = operator_config_diff(&accepted, &pending);
        let schedule_entry = diff
            .iter()
            .find(|entry| entry.field_key == "scheduled_session")
            .expect("scheduled_session diff entry");
        assert_eq!(schedule_entry.field_label, "Operator batch schedule");
        assert_eq!(schedule_entry.accepted_value, "—");
        assert!(schedule_entry.pending_value.contains("\"period\":3600"));
    }

    #[test]
    fn operator_config_diff_omits_unchanged_fees_and_scheduled_session() {
        let accepted = sample_cached("digest-a", 144);
        let mut pending = accepted.clone();
        pending.digest = "digest-b".to_string();
        pending.fees = Some(CachedFeeInfoRecord {
            intent_fee: CachedIntentFeeInfoRecord {
                offchain_input: None,
                offchain_output: None,
                onchain_input: None,
                onchain_output: None,
            },
            tx_fee_rate: "1".to_string(),
        });
        pending.scheduled_session = Some(CachedScheduledSessionRecord {
            next_start_time: 100,
            next_end_time: 200,
            period: 300,
            duration: 100,
            fees: None,
        });
        let mut accepted_with_nested = accepted.clone();
        accepted_with_nested.fees = pending.fees.clone();
        accepted_with_nested.scheduled_session = pending.scheduled_session.clone();

        let diff = operator_config_diff(&accepted_with_nested, &pending);
        let keys: Vec<&str> = diff.iter().map(|entry| entry.field_key.as_str()).collect();
        assert!(keys.contains(&"digest"));
        assert!(!keys.contains(&"fees"));
        assert!(!keys.contains(&"scheduled_session"));
    }

    #[test]
    fn digest_mismatch_detection_without_prior_cache_is_false() {
        assert!(!operator_digest_mismatch(None, "any-digest"));
    }

    #[test]
    fn digest_mismatch_detection_with_different_digest_is_true() {
        let accepted = sample_cached("digest-a", 144);
        assert!(operator_digest_mismatch(Some(&accepted), "digest-b"));
        assert!(!operator_digest_mismatch(Some(&accepted), "digest-a"));
    }

    #[test]
    fn should_block_sync_persist_when_trust_pending_even_if_digest_matches() {
        let accepted = sample_cached("digest-a", 144);
        assert!(should_block_sync_persist_for_operator_trust(
            true,
            Some(&accepted),
            "digest-a"
        ));
    }
}
