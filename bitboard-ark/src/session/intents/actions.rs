use bitcoin::secp256k1::rand::rngs::OsRng;

use crate::api_types::{
    BATCH_JOIN_STATUS_COMPLETED, BatchJoinResultDto, CollaborativeExitParams,
    PendingBatchIntentActionParams, PendingBatchIntentDto,
};
use crate::error::ArkResult;
use crate::persistence::{PendingBatchIntentKind, PendingBatchIntentRecord};
use crate::session::ArkSession;

use super::boarding::{
    BOARDING_DELETE_INTENT_UNSUPPORTED, BOARDING_REREGISTER_WHILE_INTENT_LIVE,
    is_boarding_only_pending_record, should_refuse_boarding_reregister,
};
use super::mapping::{
    completed_without_txid, join_result_for_absent_settle_inputs, parse_outpoint_record,
    pending_batch_intent_to_dto, waiting_join_result,
};
use super::reconcile::PendingBatchIntentResolution;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingIntentRetryDecision {
    CompleteWithoutRetry,
    RetryAfterDelete,
    RetryWithoutDelete,
    RefuseBoardingReregister,
}

const MIGRATE_RETRY_BLOCKED_BY_OTHER_PENDING: &str =
    "Cannot retry signer migration while another batch intent is still pending.";

impl ArkSession {
    pub async fn cancel_pending_batch_intent(
        &self,
        params: PendingBatchIntentActionParams,
    ) -> ArkResult<BatchJoinResultDto> {
        self.abort_in_flight_batch_join().await;
        let Some(record) = self.find_exact_pending_intent(&params) else {
            return Ok(completed_without_txid());
        };
        let resolution = self.pending_batch_intent_resolution(&record).await?;
        if !should_delete_operator_intent_on_cancel(&resolution) {
            self.drop_pending_intent_record(&record);
            return Ok(completed_without_txid());
        }
        if is_boarding_only_pending_record(&record) {
            return Err(crate::error::ArkWasmError::Boarding(
                BOARDING_DELETE_INTENT_UNSUPPORTED.to_string(),
            ));
        }
        let onchain_outpoints = record
            .onchain_outpoints
            .iter()
            .filter_map(parse_outpoint_record)
            .collect::<Vec<_>>();
        let vtxo_outpoints = record
            .vtxo_outpoints
            .iter()
            .filter_map(parse_outpoint_record)
            .collect::<Vec<_>>();
        let mut rng = OsRng;
        match self
            .client
            .delete_registered_intent(&mut rng, &vtxo_outpoints, &onchain_outpoints)
            .await
        {
            Ok(()) => {
                self.drop_pending_intent_record(&record);
                if should_clear_collaborative_exit_deduction_on_cancel(record.kind, &resolution) {
                    self.clear_pending_collaborative_exit_deduction();
                }
                Ok(completed_without_txid())
            }
            Err(error) if error.is_idempotent_intent_delete_miss() => {
                self.drop_pending_intent_record(&record);
                if should_clear_collaborative_exit_deduction_on_cancel(record.kind, &resolution) {
                    self.clear_pending_collaborative_exit_deduction();
                }
                Ok(completed_without_txid())
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn retry_pending_batch_intent(
        &self,
        params: PendingBatchIntentActionParams,
    ) -> ArkResult<BatchJoinResultDto> {
        self.abort_in_flight_batch_join().await;
        let Some(record) = self.find_exact_pending_intent(&params) else {
            return Ok(completed_without_txid());
        };
        let resolution = self.pending_batch_intent_resolution(&record).await?;
        match pending_intent_retry_decision(&resolution, &record) {
            PendingIntentRetryDecision::CompleteWithoutRetry => {
                self.drop_pending_intent_record(&record);
                Ok(completed_without_txid())
            }
            PendingIntentRetryDecision::RefuseBoardingReregister => {
                Err(crate::error::ArkWasmError::Boarding(
                    BOARDING_REREGISTER_WHILE_INTENT_LIVE.to_string(),
                ))
            }
            PendingIntentRetryDecision::RetryWithoutDelete => {
                // arkd deleteIntent cannot match boarding inputs (ARK-UP-01). After the
                // register expire window, settle again without a prior delete.
                self.retry_pending_record_if_still_pending(record).await
            }
            PendingIntentRetryDecision::RetryAfterDelete => {
                self.retry_after_deleting_operator_intent(record, params)
                    .await
            }
        }
    }

    fn drop_pending_intent_record(&self, record: &PendingBatchIntentRecord) {
        self.wallet_db.remove_pending_batch_intents_overlapping(
            &record.onchain_outpoints,
            &record.vtxo_outpoints,
        );
    }

    async fn retry_pending_record_if_still_pending(
        &self,
        record: PendingBatchIntentRecord,
    ) -> ArkResult<BatchJoinResultDto> {
        let resolution = self.pending_batch_intent_resolution(&record).await?;
        if !matches!(resolution, PendingBatchIntentResolution::StillPending) {
            self.drop_pending_intent_record(&record);
            return Ok(completed_without_txid());
        }
        self.retry_pending_record(record).await
    }

    async fn retry_after_deleting_operator_intent(
        &self,
        record: PendingBatchIntentRecord,
        params: PendingBatchIntentActionParams,
    ) -> ArkResult<BatchJoinResultDto> {
        let cancel_result = self.cancel_pending_batch_intent(params).await?;
        if cancel_result.status != BATCH_JOIN_STATUS_COMPLETED {
            return Ok(cancel_result);
        }
        self.retry_pending_record_if_still_pending(record).await
    }

    async fn retry_pending_record(
        &self,
        record: PendingBatchIntentRecord,
    ) -> ArkResult<BatchJoinResultDto> {
        let onchain_outpoints = record
            .onchain_outpoints
            .iter()
            .filter_map(parse_outpoint_record)
            .collect::<Vec<_>>();
        let vtxo_outpoints = record
            .vtxo_outpoints
            .iter()
            .filter_map(parse_outpoint_record)
            .collect::<Vec<_>>();
        match record.kind {
            PendingBatchIntentKind::Board
            | PendingBatchIntentKind::Recover
            | PendingBatchIntentKind::Renew => {
                let mut rng = OsRng;
                let settle = self
                    .with_batch_join(record.kind, record.amount_sats, None, || async {
                        self.client
                            .settle_vtxos(&mut rng, &vtxo_outpoints, &onchain_outpoints)
                            .await
                    })
                    .await;
                match settle {
                    Ok(Some(outcome)) => {
                        self.map_settle_outcome(
                            record.kind,
                            outcome,
                            &onchain_outpoints,
                            &vtxo_outpoints,
                            record.amount_sats,
                        )
                        .await
                    }
                    Ok(None) => join_result_for_absent_settle_inputs(),
                    Err(error) => {
                        self.map_settle_error(
                            record.kind,
                            error,
                            &onchain_outpoints,
                            &vtxo_outpoints,
                            record.amount_sats,
                        )
                        .await
                    }
                }
            }
            PendingBatchIntentKind::CollaborativeExit => {
                let destination_address = record.destination_address.ok_or_else(|| {
                    crate::error::ArkWasmError::Wallet(
                        "missing collaborative exit destination on pending intent".to_string(),
                    )
                })?;
                self.collaborative_exit(CollaborativeExitParams {
                    destination_address,
                    amount_sats: Some(record.amount_sats),
                })
                .await
            }
            PendingBatchIntentKind::Migrate => {
                let _ = self.migrate_deprecated_signer_vtxos().await?;
                migrate_retry_join_result(
                    self.find_overlapping_pending_intent(&onchain_outpoints, &vtxo_outpoints)
                        .map(pending_batch_intent_to_dto),
                    !self.wallet_db.pending_batch_intents().is_empty(),
                )
            }
        }
    }
}

fn should_delete_operator_intent_on_cancel(resolution: &PendingBatchIntentResolution) -> bool {
    matches!(resolution, PendingBatchIntentResolution::StillPending)
}

fn should_clear_collaborative_exit_deduction_on_cancel(
    kind: PendingBatchIntentKind,
    resolution: &PendingBatchIntentResolution,
) -> bool {
    kind == PendingBatchIntentKind::CollaborativeExit
        && should_delete_operator_intent_on_cancel(resolution)
}

fn pending_intent_retry_decision(
    resolution: &PendingBatchIntentResolution,
    record: &PendingBatchIntentRecord,
) -> PendingIntentRetryDecision {
    if !matches!(resolution, PendingBatchIntentResolution::StillPending) {
        return PendingIntentRetryDecision::CompleteWithoutRetry;
    }
    if is_boarding_only_pending_record(record) {
        if should_refuse_boarding_reregister(record) {
            return PendingIntentRetryDecision::RefuseBoardingReregister;
        }
        return PendingIntentRetryDecision::RetryWithoutDelete;
    }
    PendingIntentRetryDecision::RetryAfterDelete
}

fn migrate_retry_join_result(
    overlapping: Option<PendingBatchIntentDto>,
    other_pending_remain: bool,
) -> ArkResult<BatchJoinResultDto> {
    if overlapping.is_some() {
        return Ok(waiting_join_result(overlapping));
    }
    if other_pending_remain {
        return Err(crate::error::ArkWasmError::Wallet(
            MIGRATE_RETRY_BLOCKED_BY_OTHER_PENDING.to_string(),
        ));
    }
    Ok(completed_without_txid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api_types::BATCH_JOIN_STATUS_WAITING;
    use crate::constants::BOARDING_REGISTER_INTENT_TTL_SECS;
    use crate::persistence::{PendingBatchIntentLifecyclePhase, PendingBatchOutpointRecord};
    use crate::session::mappers::current_unix_timestamp;

    fn sample_vtxo_pending_record() -> PendingBatchIntentRecord {
        PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Recover,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: vec![],
            vtxo_outpoints: vec![PendingBatchOutpointRecord {
                txid: "aa".into(),
                vout: 0,
            }],
            amount_sats: 12_000,
            registered_at: 1,
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        }
    }

    fn sample_boarding_pending_record(registered_at: i64) -> PendingBatchIntentRecord {
        PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: vec![PendingBatchOutpointRecord {
                txid: "abc".into(),
                vout: 0,
            }],
            vtxo_outpoints: vec![],
            amount_sats: 50_000,
            registered_at,
            destination_address: None,
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
        }
    }

    #[test]
    fn spent_pending_intent_skips_delete() {
        assert!(!should_delete_operator_intent_on_cancel(
            &PendingBatchIntentResolution::Spent {
                spend_txid: "commitment".into(),
            }
        ));
        assert!(!should_delete_operator_intent_on_cancel(
            &PendingBatchIntentResolution::BoardingWindowExpired
        ));
        assert!(should_delete_operator_intent_on_cancel(
            &PendingBatchIntentResolution::StillPending
        ));
    }

    #[test]
    fn cancel_clears_collaborative_exit_deduction_only_while_intent_still_pending() {
        assert!(should_clear_collaborative_exit_deduction_on_cancel(
            PendingBatchIntentKind::CollaborativeExit,
            &PendingBatchIntentResolution::StillPending,
        ));
        assert!(!should_clear_collaborative_exit_deduction_on_cancel(
            PendingBatchIntentKind::CollaborativeExit,
            &PendingBatchIntentResolution::Spent {
                spend_txid: "commitment".into(),
            },
        ));
        assert!(!should_clear_collaborative_exit_deduction_on_cancel(
            PendingBatchIntentKind::Recover,
            &PendingBatchIntentResolution::StillPending,
        ));
    }

    #[test]
    fn spent_vtxo_intent_completes_without_retry() {
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::Spent {
                    spend_txid: "commitment".into(),
                },
                &sample_vtxo_pending_record(),
            ),
            PendingIntentRetryDecision::CompleteWithoutRetry
        );
    }

    #[test]
    fn boarding_window_expired_completes_without_retry() {
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::BoardingWindowExpired,
                &sample_boarding_pending_record(1),
            ),
            PendingIntentRetryDecision::CompleteWithoutRetry
        );
    }

    #[test]
    fn spent_boarding_intent_completes_without_retry() {
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::Spent {
                    spend_txid: "commitment".into(),
                },
                &sample_boarding_pending_record(current_unix_timestamp()),
            ),
            PendingIntentRetryDecision::CompleteWithoutRetry
        );
    }

    #[test]
    fn still_pending_vtxo_intent_retries_after_delete() {
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::StillPending,
                &sample_vtxo_pending_record(),
            ),
            PendingIntentRetryDecision::RetryAfterDelete
        );
    }

    #[test]
    fn still_pending_boarding_within_register_ttl_refuses_reregister() {
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::StillPending,
                &sample_boarding_pending_record(current_unix_timestamp()),
            ),
            PendingIntentRetryDecision::RefuseBoardingReregister
        );
    }

    #[test]
    fn still_pending_boarding_after_register_ttl_retries_without_delete() {
        let expired_at = current_unix_timestamp() - BOARDING_REGISTER_INTENT_TTL_SECS - 1;
        assert_eq!(
            pending_intent_retry_decision(
                &PendingBatchIntentResolution::StillPending,
                &sample_boarding_pending_record(expired_at),
            ),
            PendingIntentRetryDecision::RetryWithoutDelete
        );
    }

    #[test]
    fn migrate_retry_errors_when_other_pending_blocks_migrate() {
        let error = migrate_retry_join_result(None, true).expect_err("unrelated pending");
        assert!(
            error.to_string().contains("another batch intent"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn migrate_retry_waiting_when_overlapping_migrate_intent_exists() {
        let overlapping = PendingBatchIntentDto {
            kind: "migrate".to_string(),
            intent_id: Some("intent-1".into()),
            amount_sats: 1,
            registered_at: 1,
            onchain_outpoints: Vec::new(),
            vtxo_outpoints: Vec::new(),
            lifecycle_phase: "timed_out".to_string(),
            destination_address: None,
        };
        let result = migrate_retry_join_result(Some(overlapping), true).expect("waiting");
        assert_eq!(result.status, BATCH_JOIN_STATUS_WAITING);
        assert!(result.pending_intent.is_some());
    }

    #[test]
    fn migrate_retry_completed_when_no_pending_remain() {
        let result = migrate_retry_join_result(None, false).expect("completed");
        assert_eq!(result.status, BATCH_JOIN_STATUS_COMPLETED);
        assert!(result.pending_intent.is_none());
    }
}
