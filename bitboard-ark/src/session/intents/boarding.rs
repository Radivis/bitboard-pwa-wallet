use ark_client::Blockchain;
use bitcoin::OutPoint;

use crate::constants::BOARDING_REGISTER_INTENT_TTL_SECS;
use crate::error::ArkResult;
use crate::persistence::{PendingBatchIntentRecord, SharedPersistenceDb};
use crate::session::ArkSession;
use crate::session::mappers::{
    current_unix_timestamp, is_past_arkd_cooperative_boarding_window, wasm_safe_now,
};

/// arkd `deleteIntent` cannot match boarding-only registrations until ARK-UP-01
/// (`docs/arkade-upstream-fix-proposals.md`).
pub(super) const BOARDING_DELETE_INTENT_UNSUPPORTED: &str = "The operator cannot cancel boarding \
    batch registrations via deleteIntent yet. Wait for the registration to expire, then use Retry.";

/// Matches `prepare_intent` Register `expire_at = now + 2 * 60` in ark-client.
pub(super) const BOARDING_REREGISTER_WHILE_INTENT_LIVE: &str = "A boarding intent is already \
    registered with the operator. Re-registering now can make the operator round fail with \"not \
    enough intent confirmations\". Keep waiting for the batch, or Retry after ~2 minutes when the \
    registration expires.";

pub(super) fn is_boarding_only_pending_record(record: &PendingBatchIntentRecord) -> bool {
    !record.onchain_outpoints.is_empty() && record.vtxo_outpoints.is_empty()
}

/// Re-registering while the operator still has (or has popped) this boarding intent causes
/// BatchStarted to hash a different intent id than the wallet is waiting to ack (ARK-UP-03).
pub(super) fn should_refuse_boarding_reregister(record: &PendingBatchIntentRecord) -> bool {
    if record.intent_id.is_none() {
        return false;
    }
    let now = current_unix_timestamp();
    now.saturating_sub(record.registered_at) < BOARDING_REGISTER_INTENT_TTL_SECS
}

impl ArkSession {
    pub(super) async fn boarding_outpoint_past_cooperative_window(
        &self,
        outpoint: OutPoint,
    ) -> ArkResult<bool> {
        let persistence = SharedPersistenceDb(std::sync::Arc::clone(&self.wallet_db));
        let boarding_outputs =
            ark_client::wallet::Persistence::load_boarding_outputs(&persistence)?;
        let now_secs = wasm_safe_now().as_secs();

        for boarding_output in boarding_outputs {
            let found = self
                .client
                .blockchain()
                .find_outpoints(boarding_output.address())
                .await?;
            for utxo in found {
                if utxo.outpoint != outpoint {
                    continue;
                }
                let Some(confirmation_blocktime) = utxo.confirmation_blocktime else {
                    return Ok(false);
                };
                return Ok(is_past_arkd_cooperative_boarding_window(
                    &boarding_output,
                    confirmation_blocktime,
                    now_secs,
                ));
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::{
        PendingBatchIntentKind, PendingBatchIntentLifecyclePhase, PendingBatchOutpointRecord,
    };

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
    fn refuse_boarding_reregister_while_register_ttl_active() {
        let fresh = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: vec![PendingBatchOutpointRecord {
                txid: "abc".into(),
                vout: 0,
            }],
            vtxo_outpoints: vec![],
            amount_sats: 50_000,
            registered_at: current_unix_timestamp(),
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        };
        assert!(should_refuse_boarding_reregister(&fresh));

        let expired = PendingBatchIntentRecord {
            registered_at: current_unix_timestamp() - BOARDING_REGISTER_INTENT_TTL_SECS - 1,
            ..fresh.clone()
        };
        assert!(!should_refuse_boarding_reregister(&expired));

        let no_id = PendingBatchIntentRecord {
            intent_id: None,
            ..fresh
        };
        assert!(!should_refuse_boarding_reregister(&no_id));
    }
}
