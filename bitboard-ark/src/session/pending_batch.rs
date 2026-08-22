use std::str::FromStr;

use ark_client::{Blockchain, JoinBatchOutcome, RegisteredBatchIntent};
use bitcoin::secp256k1::rand::rngs::OsRng;
use bitcoin::{OutPoint, Txid};

use crate::api_types::{
    BATCH_JOIN_STATUS_COMPLETED, BATCH_JOIN_STATUS_WAITING, BatchJoinResultDto,
    CollaborativeExitParams, PendingBatchIntentActionParams, PendingBatchIntentDto,
    PendingBatchOutpointDto,
};
use crate::error::ArkResult;
use crate::persistence::{
    PendingBatchIntentKind, PendingBatchIntentRecord, PendingBatchOutpointRecord,
    SharedPersistenceDb,
};

use super::ArkSession;
use super::mappers::{
    current_unix_timestamp, is_past_arkd_cooperative_boarding_window, wasm_safe_now,
};

#[derive(Debug)]
enum PendingBatchIntentResolution {
    StillPending,
    Spent { spend_txid: String },
    BoardingWindowExpired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingIntentRetryDecision {
    CompleteWithoutRetry,
    RetryAfterDelete,
    RetryWithoutDelete,
    RefuseBoardingReregister,
}

impl ArkSession {
    pub(crate) fn pending_batch_intents_dto(&self) -> Vec<PendingBatchIntentDto> {
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .map(pending_batch_intent_to_dto)
            .collect()
    }

    pub(crate) fn persist_registered_batch_intent(
        &self,
        kind: PendingBatchIntentKind,
        intent: &RegisteredBatchIntent,
        amount_sats: u64,
    ) {
        self.wallet_db
            .upsert_pending_batch_intent(record_from_registered_intent(
                kind,
                intent,
                amount_sats,
                current_unix_timestamp(),
            ));
    }

    pub(crate) fn batch_join_waiting_result(
        &self,
        kind: PendingBatchIntentKind,
        intent: &RegisteredBatchIntent,
        amount_sats: u64,
    ) -> BatchJoinResultDto {
        persist_and_waiting_join_result(
            &self.wallet_db,
            record_from_registered_intent(kind, intent, amount_sats, current_unix_timestamp()),
        )
    }

    pub(crate) fn batch_join_duplicated_input_result(
        &self,
        kind: PendingBatchIntentKind,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
        amount_sats: u64,
    ) -> BatchJoinResultDto {
        persist_and_waiting_join_result(
            &self.wallet_db,
            duplicated_input_waiting_record(kind, onchain_outpoints, vtxo_outpoints, amount_sats),
        )
    }

    pub(crate) fn batch_join_completed_result(commitment_txid: Txid) -> BatchJoinResultDto {
        BatchJoinResultDto {
            status: BATCH_JOIN_STATUS_COMPLETED.to_string(),
            commitment_txid: Some(commitment_txid.to_string()),
            pending_intent: None,
        }
    }

    pub(crate) async fn existing_pending_batch_join_result(
        &self,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
    ) -> ArkResult<Option<BatchJoinResultDto>> {
        self.reconcile_pending_batch_intents().await?;
        let overlap = self.find_overlapping_pending_intent(onchain_outpoints, vtxo_outpoints);
        if overlap.is_none() {
            return Ok(None);
        }
        Ok(Some(waiting_join_result(
            overlap.map(pending_batch_intent_to_dto),
        )))
    }

    pub(crate) async fn map_settle_outcome(
        &self,
        kind: PendingBatchIntentKind,
        outcome: JoinBatchOutcome,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
        amount_sats: u64,
    ) -> ArkResult<BatchJoinResultDto> {
        match outcome {
            JoinBatchOutcome::Completed(commitment_txid) => {
                let onchain_records = onchain_outpoints
                    .iter()
                    .copied()
                    .map(outpoint_record)
                    .collect::<Vec<_>>();
                let vtxo_records = vtxo_outpoints
                    .iter()
                    .copied()
                    .map(outpoint_record)
                    .collect::<Vec<_>>();
                self.wallet_db
                    .remove_pending_batch_intents_overlapping(&onchain_records, &vtxo_records);
                Ok(Self::batch_join_completed_result(commitment_txid))
            }
            JoinBatchOutcome::Waiting(intent) => {
                let _ = (onchain_outpoints, vtxo_outpoints);
                Ok(self.batch_join_waiting_result(kind, &intent, amount_sats))
            }
        }
    }

    pub(crate) async fn map_settle_error(
        &self,
        kind: PendingBatchIntentKind,
        error: ark_client::Error,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
        amount_sats: u64,
    ) -> ArkResult<BatchJoinResultDto> {
        if error.is_duplicated_input() {
            return Ok(self.batch_join_duplicated_input_result(
                kind,
                onchain_outpoints,
                vtxo_outpoints,
                amount_sats,
            ));
        }
        Err(error.into())
    }

    pub async fn cancel_pending_batch_intent(
        &self,
        params: PendingBatchIntentActionParams,
    ) -> ArkResult<BatchJoinResultDto> {
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
            )
            .into());
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
                Ok(completed_without_txid())
            }
            Err(error) if error.is_intent_not_found() => {
                self.drop_pending_intent_record(&record);
                Ok(completed_without_txid())
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn retry_pending_batch_intent(
        &self,
        params: PendingBatchIntentActionParams,
    ) -> ArkResult<BatchJoinResultDto> {
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
                )
                .into())
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

    /// Drop pending intents whose inputs are spent or whose boarding window has closed.
    /// Returns the spend txid when an intent was finalized this pass.
    pub(crate) async fn reconcile_pending_batch_intents(&self) -> ArkResult<Option<String>> {
        let pending = self.wallet_db.pending_batch_intents();
        if pending.is_empty() {
            return Ok(None);
        }

        let mut remaining = Vec::new();
        let mut finalized_txid = None;
        for record in pending {
            match self.pending_batch_intent_resolution(&record).await? {
                PendingBatchIntentResolution::StillPending => remaining.push(record),
                PendingBatchIntentResolution::Spent { spend_txid } => {
                    finalized_txid = Some(spend_txid);
                }
                PendingBatchIntentResolution::BoardingWindowExpired => {}
            }
        }
        self.wallet_db.set_pending_batch_intents(remaining);
        Ok(finalized_txid)
    }

    async fn pending_batch_intent_resolution(
        &self,
        record: &PendingBatchIntentRecord,
    ) -> ArkResult<PendingBatchIntentResolution> {
        if !record.onchain_outpoints.is_empty() {
            return self.resolve_onchain_pending_intent(record).await;
        }
        if !record.vtxo_outpoints.is_empty() {
            return Ok(resolve_vtxo_pending_intent(
                record,
                self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref(),
            ));
        }
        Ok(PendingBatchIntentResolution::StillPending)
    }

    async fn resolve_onchain_pending_intent(
        &self,
        record: &PendingBatchIntentRecord,
    ) -> ArkResult<PendingBatchIntentResolution> {
        let Some(outpoint) = record
            .onchain_outpoints
            .first()
            .and_then(parse_outpoint_record)
        else {
            return Ok(PendingBatchIntentResolution::StillPending);
        };

        let spend_status = self
            .client
            .blockchain()
            .get_output_status(&outpoint.txid, outpoint.vout)
            .await?;
        let boarding_window_expired = record.kind == PendingBatchIntentKind::Board
            && spend_status.spend_txid.is_none()
            && self
                .boarding_outpoint_past_cooperative_window(outpoint)
                .await?;
        Ok(resolve_onchain_output_status(
            spend_status.spend_txid.map(|txid| txid.to_string()),
            record.kind,
            boarding_window_expired,
        ))
    }

    async fn boarding_outpoint_past_cooperative_window(
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

    fn find_overlapping_pending_intent(
        &self,
        onchain_outpoints: &[OutPoint],
        vtxo_outpoints: &[OutPoint],
    ) -> Option<PendingBatchIntentRecord> {
        let onchain_records = onchain_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        let vtxo_records = vtxo_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .find(|record| {
                pending_record_overlaps_outpoints(record, &onchain_records, &vtxo_records)
            })
    }

    fn find_exact_pending_intent(
        &self,
        params: &PendingBatchIntentActionParams,
    ) -> Option<PendingBatchIntentRecord> {
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .find(|record| {
                outpoint_records_equal(&record.onchain_outpoints, &params.onchain_outpoints)
                    && outpoint_records_equal(&record.vtxo_outpoints, &params.vtxo_outpoints)
            })
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
                match self
                    .client
                    .settle_vtxos(&mut rng, &vtxo_outpoints, &onchain_outpoints)
                    .await
                {
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
                    Ok(None) => Ok(completed_without_txid()),
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
                Ok(waiting_join_result(
                    self.find_overlapping_pending_intent(&onchain_outpoints, &vtxo_outpoints)
                        .map(pending_batch_intent_to_dto),
                ))
            }
        }
    }
}

fn resolve_onchain_output_status(
    spend_txid: Option<String>,
    kind: PendingBatchIntentKind,
    boarding_window_expired: bool,
) -> PendingBatchIntentResolution {
    if let Some(spend_txid) = spend_txid {
        return PendingBatchIntentResolution::Spent { spend_txid };
    }
    if kind == PendingBatchIntentKind::Board && boarding_window_expired {
        return PendingBatchIntentResolution::BoardingWindowExpired;
    }
    PendingBatchIntentResolution::StillPending
}

fn resolve_vtxo_pending_intent(
    record: &PendingBatchIntentRecord,
    snapshot: Option<&crate::persistence::OffchainVtxoSnapshot>,
) -> PendingBatchIntentResolution {
    let Some(snapshot) = snapshot else {
        return PendingBatchIntentResolution::StillPending;
    };

    let mut saw_any = false;
    let mut all_spent = true;
    let mut spend_txid = None;
    for pending_outpoint in &record.vtxo_outpoints {
        let Some(row) = snapshot
            .virtual_tx_outpoints
            .iter()
            .find(|row| row.txid == pending_outpoint.txid && row.vout == pending_outpoint.vout)
        else {
            continue;
        };
        saw_any = true;
        if row.is_spent || row.settled_by.is_some() {
            spend_txid = row
                .settled_by
                .clone()
                .or_else(|| row.spent_by.clone())
                .or(spend_txid);
            continue;
        }
        all_spent = false;
    }

    if saw_any && all_spent {
        PendingBatchIntentResolution::Spent {
            spend_txid: spend_txid.unwrap_or_default(),
        }
    } else {
        PendingBatchIntentResolution::StillPending
    }
}

pub(crate) fn record_from_registered_intent(
    kind: PendingBatchIntentKind,
    intent: &RegisteredBatchIntent,
    amount_sats: u64,
    registered_at: i64,
) -> PendingBatchIntentRecord {
    let intent_id = if intent.intent_id.is_empty() {
        None
    } else {
        Some(intent.intent_id.clone())
    };
    PendingBatchIntentRecord {
        kind,
        intent_id,
        onchain_outpoints: intent
            .onchain_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect(),
        vtxo_outpoints: intent
            .vtxo_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect(),
        amount_sats,
        registered_at,
        destination_address: None,
    }
}

pub(crate) fn pending_batch_intent_to_dto(
    record: PendingBatchIntentRecord,
) -> PendingBatchIntentDto {
    PendingBatchIntentDto {
        kind: pending_batch_intent_kind_label(record.kind).to_string(),
        intent_id: record.intent_id,
        amount_sats: record.amount_sats,
        registered_at: record.registered_at,
        onchain_outpoints: record
            .onchain_outpoints
            .into_iter()
            .map(outpoint_dto)
            .collect(),
        vtxo_outpoints: record
            .vtxo_outpoints
            .into_iter()
            .map(outpoint_dto)
            .collect(),
    }
}

pub(crate) fn waiting_join_result(
    pending_intent: Option<PendingBatchIntentDto>,
) -> BatchJoinResultDto {
    BatchJoinResultDto {
        status: BATCH_JOIN_STATUS_WAITING.to_string(),
        commitment_txid: None,
        pending_intent,
    }
}

pub(crate) fn persist_and_waiting_join_result(
    db: &crate::persistence::JsonPersistenceDb,
    record: PendingBatchIntentRecord,
) -> BatchJoinResultDto {
    db.upsert_pending_batch_intent(record.clone());
    waiting_join_result(Some(pending_batch_intent_to_dto(record)))
}

fn duplicated_input_waiting_record(
    kind: PendingBatchIntentKind,
    onchain_outpoints: &[OutPoint],
    vtxo_outpoints: &[OutPoint],
    amount_sats: u64,
) -> PendingBatchIntentRecord {
    PendingBatchIntentRecord {
        kind,
        intent_id: None,
        onchain_outpoints: onchain_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect(),
        vtxo_outpoints: vtxo_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect(),
        amount_sats,
        registered_at: current_unix_timestamp(),
        destination_address: None,
    }
}

pub(crate) fn pending_batch_intent_kind_label(kind: PendingBatchIntentKind) -> &'static str {
    match kind {
        PendingBatchIntentKind::Board => "board",
        PendingBatchIntentKind::Recover => "recover",
        PendingBatchIntentKind::Renew => "renew",
        PendingBatchIntentKind::CollaborativeExit => "collaborative_exit",
        PendingBatchIntentKind::Migrate => "migrate",
    }
}

fn outpoint_record(outpoint: OutPoint) -> PendingBatchOutpointRecord {
    PendingBatchOutpointRecord {
        txid: outpoint.txid.to_string(),
        vout: outpoint.vout,
    }
}

fn outpoint_dto(record: PendingBatchOutpointRecord) -> PendingBatchOutpointDto {
    PendingBatchOutpointDto {
        txid: record.txid,
        vout: record.vout,
    }
}

fn parse_outpoint_record(record: &PendingBatchOutpointRecord) -> Option<OutPoint> {
    let txid = Txid::from_str(&record.txid).ok()?;
    Some(OutPoint {
        txid,
        vout: record.vout,
    })
}

/// arkd `deleteIntent` cannot match boarding-only registrations until ARK-UP-01
/// (`docs/arkade-upstream-fix-proposals.md`).
const BOARDING_DELETE_INTENT_UNSUPPORTED: &str = "The operator cannot cancel boarding batch \
    registrations via deleteIntent yet. Wait for the registration to expire, then use Retry.";

/// Matches `prepare_intent` Register `expire_at = now + 2 * 60` in ark-client.
const BOARDING_REGISTER_INTENT_TTL_SECS: i64 = 2 * 60;

const BOARDING_REREGISTER_WHILE_INTENT_LIVE: &str = "A boarding intent is already registered with \
    the operator. Re-registering now can make the operator round fail with \"not enough intent \
    confirmations\". Keep waiting for the batch, or Retry after ~2 minutes when the registration \
    expires.";

fn should_delete_operator_intent_on_cancel(resolution: &PendingBatchIntentResolution) -> bool {
    matches!(resolution, PendingBatchIntentResolution::StillPending)
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

fn is_boarding_only_pending_record(record: &PendingBatchIntentRecord) -> bool {
    !record.onchain_outpoints.is_empty() && record.vtxo_outpoints.is_empty()
}

/// Re-registering while the operator still has (or has popped) this boarding intent causes
/// BatchStarted to hash a different intent id than the wallet is waiting to ack (ARK-UP-03).
fn should_refuse_boarding_reregister(record: &PendingBatchIntentRecord) -> bool {
    if record.intent_id.is_none() {
        return false;
    }
    let now = current_unix_timestamp();
    now.saturating_sub(record.registered_at) < BOARDING_REGISTER_INTENT_TTL_SECS
}

fn pending_record_overlaps_outpoints(
    record: &PendingBatchIntentRecord,
    onchain_outpoints: &[PendingBatchOutpointRecord],
    vtxo_outpoints: &[PendingBatchOutpointRecord],
) -> bool {
    outpoint_records_overlap(&record.onchain_outpoints, onchain_outpoints)
        || outpoint_records_overlap(&record.vtxo_outpoints, vtxo_outpoints)
}

fn outpoint_records_overlap(
    left: &[PendingBatchOutpointRecord],
    right: &[PendingBatchOutpointRecord],
) -> bool {
    left.iter().any(|left_item| {
        right.iter().any(|right_item| {
            left_item.txid == right_item.txid && left_item.vout == right_item.vout
        })
    })
}

fn outpoint_records_equal(
    left: &[PendingBatchOutpointRecord],
    right: &[PendingBatchOutpointDto],
) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter().all(|left_item| {
        right.iter().any(|right_item| {
            left_item.txid == right_item.txid && left_item.vout == right_item.vout
        })
    })
}

fn completed_without_txid() -> BatchJoinResultDto {
    BatchJoinResultDto {
        status: BATCH_JOIN_STATUS_COMPLETED.to_string(),
        commitment_txid: None,
        pending_intent: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_client::RegisteredBatchIntent;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn sample_outpoint(byte: u8, vout: u32) -> OutPoint {
        OutPoint {
            txid: Txid::from_byte_array([byte; 32]),
            vout,
        }
    }

    #[test]
    fn record_from_registered_intent_maps_outpoints_and_omits_empty_id() {
        let intent = RegisteredBatchIntent {
            intent_id: String::new(),
            onchain_outpoints: vec![sample_outpoint(0x11, 1)],
            vtxo_outpoints: vec![sample_outpoint(0x22, 0)],
        };
        let record =
            record_from_registered_intent(PendingBatchIntentKind::Board, &intent, 50_000, 10);
        assert_eq!(record.intent_id, None);
        assert_eq!(record.onchain_outpoints[0].vout, 1);
        assert_eq!(record.vtxo_outpoints[0].vout, 0);
        assert_eq!(record.amount_sats, 50_000);
    }

    #[test]
    fn duplicated_input_error_is_detected() {
        let error = ark_client::Error::wallet(
            "Failed to join batch: failed to push intent: duplicated input, abc:1 already registered",
        );
        assert!(error.is_duplicated_input());
    }

    #[test]
    fn is_intent_not_found_detects_missing_operator_intent() {
        let arkd = ark_client::Error::wallet(
            r#"request failed: error in response: status code 400 Bad Request: {"code":3,"message":"INVALID_INTENT_PROOF (23): no matching intents found for intent proof"}"#,
        );
        assert!(!arkd.is_intent_not_found());
        assert!(arkd.is_intent_proof_no_operator_match());
    }

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
        }
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
    fn reconcile_clears_pending_boarding_intent_when_outpoint_spent() {
        match resolve_onchain_output_status(
            Some("commitment-txid".into()),
            PendingBatchIntentKind::Board,
            false,
        ) {
            PendingBatchIntentResolution::Spent { spend_txid } => {
                assert_eq!(spend_txid, "commitment-txid");
            }
            other => panic!("expected spent, got {other:?}"),
        }
    }

    #[test]
    fn duplicated_input_maps_to_waiting_without_reregister() {
        let error = ark_client::Error::wallet(
            "Failed to join batch: failed to push intent: duplicated input, abc:1 already registered",
        );
        assert!(error.is_duplicated_input());

        let record = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: None,
            onchain_outpoints: vec![outpoint_record(sample_outpoint(0xab, 1))],
            vtxo_outpoints: Vec::new(),
            amount_sats: 50_000,
            registered_at: 1,
            destination_address: None,
        };
        let result = waiting_join_result(Some(pending_batch_intent_to_dto(record)));
        assert_eq!(result.status, BATCH_JOIN_STATUS_WAITING);
        assert!(result.commitment_txid.is_none());
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .and_then(|intent| intent.intent_id.as_deref()),
            None
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .map(|intent| intent.kind.as_str()),
            Some("board")
        );
    }

    #[test]
    fn overlapping_pending_blocks_only_shared_outpoints() {
        let board = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("board".into()),
            onchain_outpoints: vec![outpoint_record(sample_outpoint(0xaa, 1))],
            vtxo_outpoints: Vec::new(),
            amount_sats: 1,
            registered_at: 1,
            destination_address: None,
        };
        let recover_outpoint = outpoint_record(sample_outpoint(0xbb, 0));
        assert!(!pending_record_overlaps_outpoints(
            &board,
            &[],
            &[recover_outpoint],
        ));
        assert!(pending_record_overlaps_outpoints(
            &board,
            &[outpoint_record(sample_outpoint(0xaa, 1))],
            &[],
        ));
    }

    fn sample_pending_record(
        kind: PendingBatchIntentKind,
        intent_id: &str,
        onchain_vout: Option<u32>,
        vtxo_vout: Option<u32>,
    ) -> PendingBatchIntentRecord {
        PendingBatchIntentRecord {
            kind,
            intent_id: Some(intent_id.into()),
            onchain_outpoints: onchain_vout
                .map(|vout| outpoint_record(sample_outpoint(0xaa, vout)))
                .into_iter()
                .collect(),
            vtxo_outpoints: vtxo_vout
                .map(|vout| outpoint_record(sample_outpoint(0xbb, vout)))
                .into_iter()
                .collect(),
            amount_sats: 12_000,
            registered_at: 1,
            destination_address: None,
        }
    }

    #[test]
    fn persist_and_waiting_join_result_returns_recover_when_an_older_board_row_exists() {
        let db = crate::persistence::JsonPersistenceDb::default();
        db.upsert_pending_batch_intent(sample_pending_record(
            PendingBatchIntentKind::Board,
            "board",
            Some(1),
            None,
        ));
        let result = persist_and_waiting_join_result(
            &db,
            sample_pending_record(PendingBatchIntentKind::Recover, "recover", None, Some(0)),
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .map(|intent| intent.kind.as_str()),
            Some("recover")
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .and_then(|intent| intent.intent_id.as_deref()),
            Some("recover")
        );
    }

    #[test]
    fn persist_and_waiting_join_result_returns_collaborative_exit_when_an_older_board_row_exists() {
        let db = crate::persistence::JsonPersistenceDb::default();
        db.upsert_pending_batch_intent(sample_pending_record(
            PendingBatchIntentKind::Board,
            "board",
            Some(1),
            None,
        ));
        let result = persist_and_waiting_join_result(
            &db,
            sample_pending_record(
                PendingBatchIntentKind::CollaborativeExit,
                "collab",
                None,
                Some(1),
            ),
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .map(|intent| intent.kind.as_str()),
            Some("collaborative_exit")
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .and_then(|intent| intent.intent_id.as_deref()),
            Some("collab")
        );
    }

    #[test]
    fn boarding_status_includes_pending_batch_intents_list() {
        let record = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Board,
            intent_id: Some("intent-abc".into()),
            onchain_outpoints: vec![outpoint_record(sample_outpoint(0x11, 1))],
            vtxo_outpoints: Vec::new(),
            amount_sats: 50_000,
            registered_at: 1_700_000_000,
            destination_address: None,
        };
        let dto = crate::api_types::BoardingStatusDto {
            boarding_address: "tb1qboarding".into(),
            tracked_addresses: vec!["tb1qboarding".into()],
            spendable_sats: 50_000,
            pending_sats: 0,
            expired_sats: 0,
            pending_batch_intents: vec![pending_batch_intent_to_dto(record)],
            finalized_commitment_txid: None,
        };
        let json = serde_json::to_value(&dto).expect("serialize boarding status");
        assert_eq!(json["pendingBatchIntents"][0]["kind"], "board");
        assert_eq!(json["pendingBatchIntents"][0]["intentId"], "intent-abc");
        assert_eq!(json["pendingBatchIntents"][0]["amountSats"], 50_000);
        assert_eq!(
            json["pendingBatchIntents"][0]["onchainOutpoints"][0]["vout"],
            1
        );
    }

    #[test]
    fn vtxo_pending_intent_clears_when_snapshot_marks_spent() {
        let outpoint = sample_outpoint(0xaa, 0);
        let record = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::Recover,
            intent_id: Some("intent-1".into()),
            onchain_outpoints: Vec::new(),
            vtxo_outpoints: vec![outpoint_record(outpoint)],
            amount_sats: 12_000,
            registered_at: 1,
            destination_address: None,
        };
        let snapshot = crate::persistence::OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![crate::persistence::VirtualTxOutPointRecord {
                txid: outpoint.txid.to_string(),
                vout: 0,
                created_at: 1,
                expires_at: 2,
                amount_sats: 12_000,
                script_hex: String::new(),
                is_preconfirmed: false,
                is_swept: false,
                is_unrolled: false,
                is_spent: true,
                spent_by: Some("commitment".into()),
                commitment_txids: Vec::new(),
                settled_by: None,
                ark_txid: None,
                assets: Vec::new(),
                server_pk_hex: None,
            }],
            unilateral_exit_materials_by_leaf_tx: Default::default(),
        };
        match resolve_vtxo_pending_intent(&record, Some(&snapshot)) {
            PendingBatchIntentResolution::Spent { spend_txid } => {
                assert_eq!(spend_txid, "commitment");
            }
            other => panic!("expected spent, got {other:?}"),
        }
    }
}
