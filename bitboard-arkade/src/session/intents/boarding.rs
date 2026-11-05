use ark_client::Blockchain;
use bitcoin::OutPoint;

use crate::constants::{BOARDING_REGISTER_INTENT_TTL_SECS, BOARDING_REREGISTER_MIN_HOLD_SECS};
use crate::error::ArkResult;
use crate::persistence::{PendingBatchIntentRecord, SharedPersistenceDb};
use crate::session::ArkadeSession;
use crate::session::mappers::{is_past_arkd_cooperative_boarding_window, wasm_safe_now};

/// arkd `deleteIntent` cannot match boarding-only registrations until ARK-UP-01
/// (`docs/arkade-upstream-fix-proposals.md`).
pub(super) const BOARDING_DELETE_INTENT_UNSUPPORTED: &str = "The operator cannot cancel boarding \
    batch registrations via deleteIntent yet. Wait for the registration to expire, then use Retry.";

/// Matches `prepare_intent` Register `expire_at = now + 2 * 60` in ark-client.
pub(super) const BOARDING_REREGISTER_WHILE_INTENT_LIVE: &str = "A boarding intent for this \
    output may still be in the operator's current round. Registering again can fail that round \
    with \"not enough intent confirmations\". Wait for this round to finish, then settle again.";

pub(super) fn is_boarding_only_pending_record(record: &PendingBatchIntentRecord) -> bool {
    !record.onchain_outpoints.is_empty() && record.vtxo_outpoints.is_empty()
}

/// How long after the registration TTL a popped boarding intent may still be in confirmation.
///
/// Prefer the operator `sessionDuration`. Fall back to one minute when it is missing or zero.
pub(super) fn boarding_reregister_hold_seconds(session_duration_seconds: i64) -> i64 {
    if session_duration_seconds > 0 {
        session_duration_seconds
    } else {
        BOARDING_REREGISTER_MIN_HOLD_SECS
    }
}

/// Re-registering while the operator still has (or has popped) this boarding intent causes
/// BatchStarted to hash a different intent id than the wallet is waiting to ack (ARK-UP-03).
///
/// The refusal lasts through the registration TTL and one more operator session, so clearing
/// the pending row does not happen at the same instant a new `RegisterIntent` is allowed.
pub(super) fn should_refuse_boarding_reregister(
    record: &PendingBatchIntentRecord,
    now_unix_seconds: i64,
    session_duration_seconds: i64,
) -> bool {
    if record.intent_id.is_none() || !is_boarding_only_pending_record(record) {
        return false;
    }
    let blocked_for = BOARDING_REGISTER_INTENT_TTL_SECS
        + boarding_reregister_hold_seconds(session_duration_seconds);
    now_unix_seconds.saturating_sub(record.registered_at) < blocked_for
}

impl ArkadeSession {
    pub(super) async fn boarding_outpoint_past_cooperative_window(
        &self,
        outpoint: OutPoint,
    ) -> ArkResult<bool> {
        let persistence = SharedPersistenceDb(std::sync::Arc::clone(&self.wallet_db));
        let boarding_outputs = persistence.load_boarding_outputs()?;
        let now_secs = wasm_safe_now().as_secs();
        let Some(transaction) = self.client.blockchain().find_tx(&outpoint.txid).await? else {
            return Ok(false);
        };
        let Some(output) = transaction.output.get(outpoint.vout as usize) else {
            return Ok(false);
        };
        let Some(boarding_output) = boarding_outputs
            .iter()
            .find(|candidate| candidate.script_pubkey() == output.script_pubkey)
        else {
            return Ok(false);
        };
        let Some(confirmation_blocktime) = self
            .client
            .blockchain()
            .get_tx_status(&outpoint.txid)
            .await?
            .confirmed_at
        else {
            return Ok(false);
        };
        if confirmation_blocktime < 0 {
            return Ok(false);
        }
        Ok(is_past_arkd_cooperative_boarding_window(
            boarding_output,
            confirmation_blocktime as u64,
            now_secs,
        ))
    }

    /// Refuse a second boarding RegisterIntent while the previous one may still be in a round.
    pub(crate) async fn ensure_boarding_reregister_allowed(
        &self,
        onchain_outpoints: &[OutPoint],
    ) -> ArkResult<()> {
        self.reconcile_pending_batch_intents().await?;
        let Some(record) = self.find_overlapping_pending_intent(onchain_outpoints, &[]) else {
            return Ok(());
        };
        if record.lifecycle_phase
            != crate::persistence::PendingBatchIntentLifecyclePhase::ReregisterHold
        {
            return Ok(());
        }
        Err(crate::error::ArkWasmError::Boarding(
            BOARDING_REREGISTER_WHILE_INTENT_LIVE.to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{
        PendingBatchIntentKind, PendingBatchIntentLifecyclePhase, PendingBatchOutpointRecord,
    };
    use crate::session::mappers::current_unix_timestamp;

    #[test]
    fn boarding_only_pending_record_detection() {
        let boarding = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: vec![PendingBatchOutpointRecord {
                txid: "abc".into(),
                vout: 0,
            }],
            vtxo_outpoints: vec![],
            amount_sats: 50_000,
            registered_at: 1,
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        };
        assert!(is_boarding_only_pending_record(&boarding));

        let mixed = PendingBatchIntentRecord {
            vtxo_outpoints: vec![PendingBatchOutpointRecord {
                txid: "vtxo".into(),
                vout: 1,
            }],
            ..boarding
        };
        assert!(!is_boarding_only_pending_record(&mixed));
    }

    #[test]
    fn refuse_boarding_reregister_through_the_session_hold() {
        let now = current_unix_timestamp();
        let session_duration_seconds = 60;
        let fresh = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: vec![PendingBatchOutpointRecord {
                txid: "abc".into(),
                vout: 0,
            }],
            vtxo_outpoints: vec![],
            amount_sats: 50_000,
            registered_at: now,
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        };
        assert!(should_refuse_boarding_reregister(
            &fresh,
            now,
            session_duration_seconds
        ));

        let just_after_ttl = PendingBatchIntentRecord {
            registered_at: now - BOARDING_REGISTER_INTENT_TTL_SECS - 1,
            ..fresh.clone()
        };
        assert!(should_refuse_boarding_reregister(
            &just_after_ttl,
            now,
            session_duration_seconds
        ));

        let hold_elapsed = PendingBatchIntentRecord {
            registered_at: now - BOARDING_REGISTER_INTENT_TTL_SECS - session_duration_seconds,
            ..fresh.clone()
        };
        assert!(!should_refuse_boarding_reregister(
            &hold_elapsed,
            now,
            session_duration_seconds
        ));

        let no_id = PendingBatchIntentRecord {
            intent_id: None,
            ..fresh
        };
        assert!(!should_refuse_boarding_reregister(
            &no_id,
            now,
            session_duration_seconds
        ));
    }
}
