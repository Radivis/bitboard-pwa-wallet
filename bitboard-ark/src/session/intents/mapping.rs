use std::str::FromStr;

use ark_client::RegisteredBatchIntent;
use bitcoin::{OutPoint, Txid};

use crate::api_types::{
    BATCH_JOIN_STATUS_COMPLETED, BATCH_JOIN_STATUS_WAITING, BatchJoinResultDto,
    PendingBatchIntentDto, PendingBatchOutpointDto,
};
use crate::error::ArkResult;
use crate::persistence::{
    JsonPersistenceDb, PendingBatchIntentKind, PendingBatchIntentLifecyclePhase,
    PendingBatchIntentRecord, PendingBatchOutpointRecord,
};
use crate::session::ArkSession;
use crate::session::mappers::current_unix_timestamp;

const SETTLE_RETURNED_NO_MATCHING_INPUTS: &str = "Settle returned no matching inputs even though \
    the pending intent still looks unspent. Try again in a moment.";

impl ArkSession {
    pub(crate) fn pending_batch_intents_dto(&self) -> Vec<PendingBatchIntentDto> {
        self.wallet_db
            .pending_batch_intents()
            .into_iter()
            .map(pending_batch_intent_to_dto)
            .collect()
    }
}

pub(super) fn record_from_registered_intent(
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
        lifecycle_phase: PendingBatchIntentLifecyclePhase::Processing,
    }
}

pub(super) fn pending_batch_intent_to_dto(
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
        lifecycle_phase: pending_batch_intent_lifecycle_phase_label(record.lifecycle_phase)
            .to_string(),
        destination_address: record.destination_address,
    }
}

pub(super) fn waiting_join_result(
    pending_intent: Option<PendingBatchIntentDto>,
) -> BatchJoinResultDto {
    BatchJoinResultDto {
        status: BATCH_JOIN_STATUS_WAITING.to_string(),
        commitment_txid: None,
        pending_intent,
    }
}

pub(super) fn persist_and_waiting_join_result(
    db: &JsonPersistenceDb,
    mut record: PendingBatchIntentRecord,
) -> BatchJoinResultDto {
    if pending_intent_outpoints_empty(&record) {
        return waiting_join_result(
            latest_pending_record_of_kind(db, record.kind).map(pending_batch_intent_to_dto),
        );
    }
    record.lifecycle_phase = PendingBatchIntentLifecyclePhase::TimedOut;
    db.upsert_pending_batch_intent(record.clone());
    waiting_join_result(Some(pending_batch_intent_to_dto(record)))
}

fn pending_intent_outpoints_empty(record: &PendingBatchIntentRecord) -> bool {
    record.onchain_outpoints.is_empty() && record.vtxo_outpoints.is_empty()
}

pub(super) fn latest_pending_record_of_kind(
    db: &JsonPersistenceDb,
    kind: PendingBatchIntentKind,
) -> Option<PendingBatchIntentRecord> {
    db.pending_batch_intents()
        .into_iter()
        .rev()
        .find(|item| item.kind == kind)
}

pub(super) fn duplicated_input_waiting_record(
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
        lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
    }
}

fn pending_batch_intent_kind_label(kind: PendingBatchIntentKind) -> &'static str {
    match kind {
        PendingBatchIntentKind::Board => "board",
        PendingBatchIntentKind::Recover => "recover",
        PendingBatchIntentKind::Renew => "renew",
        PendingBatchIntentKind::CollaborativeExit => "collaborative_exit",
        PendingBatchIntentKind::Migrate => "migrate",
    }
}

fn pending_batch_intent_lifecycle_phase_label(
    phase: PendingBatchIntentLifecyclePhase,
) -> &'static str {
    match phase {
        PendingBatchIntentLifecyclePhase::Processing => "processing",
        PendingBatchIntentLifecyclePhase::TimedOut => "timed_out",
    }
}

pub(super) fn outpoint_record(outpoint: OutPoint) -> PendingBatchOutpointRecord {
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

pub(super) fn parse_outpoint_record(record: &PendingBatchOutpointRecord) -> Option<OutPoint> {
    let txid = Txid::from_str(&record.txid).ok()?;
    Some(OutPoint {
        txid,
        vout: record.vout,
    })
}

pub(super) fn completed_without_txid() -> BatchJoinResultDto {
    BatchJoinResultDto {
        status: BATCH_JOIN_STATUS_COMPLETED.to_string(),
        commitment_txid: None,
        pending_intent: None,
    }
}

/// Retry / settle mapped `Ok(None)` (no matching spendable inputs). Must not look like success.
pub(crate) fn join_result_for_absent_settle_inputs() -> ArkResult<BatchJoinResultDto> {
    Err(crate::error::ArkWasmError::Boarding(
        SETTLE_RETURNED_NO_MATCHING_INPUTS.to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::hashes::Hash;

    fn sample_outpoint(byte: u8, vout: u32) -> OutPoint {
        OutPoint {
            txid: Txid::from_byte_array([byte; 32]),
            vout,
        }
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
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
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
    fn record_from_registered_intent_starts_in_processing() {
        let intent = RegisteredBatchIntent {
            intent_id: "intent-1".into(),
            onchain_outpoints: vec![sample_outpoint(0x11, 1)],
            vtxo_outpoints: vec![],
        };
        let record =
            record_from_registered_intent(PendingBatchIntentKind::Board, &intent, 50_000, 10);
        assert_eq!(
            record.lifecycle_phase,
            PendingBatchIntentLifecyclePhase::Processing
        );
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
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
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
    fn persist_and_waiting_join_result_does_not_insert_empty_outpoint_row() {
        let db = JsonPersistenceDb::default();
        let empty = sample_pending_record(
            PendingBatchIntentKind::CollaborativeExit,
            "empty-collab",
            None,
            None,
        );
        persist_and_waiting_join_result(&db, empty);
        assert!(
            db.pending_batch_intents().is_empty(),
            "empty-outpoint waiting rows can never be cancelled or reconciled"
        );
    }

    #[test]
    fn persist_and_waiting_join_result_empty_outpoints_returns_existing_kind() {
        let db = JsonPersistenceDb::default();
        db.upsert_pending_batch_intent(sample_pending_record(
            PendingBatchIntentKind::CollaborativeExit,
            "collab",
            None,
            Some(1),
        ));
        let empty = sample_pending_record(
            PendingBatchIntentKind::CollaborativeExit,
            "empty-collab",
            None,
            None,
        );
        let result = persist_and_waiting_join_result(&db, empty);
        assert_eq!(db.pending_batch_intents().len(), 1);
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .and_then(|intent| intent.intent_id.as_deref()),
            Some("collab")
        );
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .map(|intent| intent.kind.as_str()),
            Some("collaborative_exit")
        );
    }

    #[test]
    fn persist_and_waiting_join_result_returns_recover_when_an_older_board_row_exists() {
        let db = JsonPersistenceDb::default();
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
        let db = JsonPersistenceDb::default();
        db.upsert_pending_batch_intent(sample_pending_record(
            PendingBatchIntentKind::Board,
            "board",
            Some(1),
            None,
        ));
        let result = persist_and_waiting_join_result(&db, {
            let mut record = sample_pending_record(
                PendingBatchIntentKind::CollaborativeExit,
                "collab",
                None,
                Some(1),
            );
            record.destination_address = Some("tb1qcollab".into());
            record
        });
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
        assert_eq!(
            result
                .pending_intent
                .as_ref()
                .and_then(|intent| intent.destination_address.as_deref()),
            Some("tb1qcollab")
        );
    }

    #[test]
    fn persist_and_waiting_stamps_timed_out() {
        let db = JsonPersistenceDb::default();
        let mut record =
            sample_pending_record(PendingBatchIntentKind::Recover, "recover", None, Some(0));
        record.lifecycle_phase = PendingBatchIntentLifecyclePhase::Processing;
        persist_and_waiting_join_result(&db, record);
        assert_eq!(
            db.pending_batch_intents()[0].lifecycle_phase,
            PendingBatchIntentLifecyclePhase::TimedOut
        );
    }

    #[test]
    fn absent_settle_inputs_on_retry_is_error_not_completed() {
        let result = join_result_for_absent_settle_inputs();
        assert!(
            result.is_err(),
            "settle Ok(None) must not report completed while the pending row may still exist"
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
            lifecycle_phase: PendingBatchIntentLifecyclePhase::TimedOut,
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
        assert_eq!(
            json["pendingBatchIntents"][0]["lifecyclePhase"],
            "timed_out"
        );
        assert!(
            json["pendingBatchIntents"][0]
                .get("destinationAddress")
                .is_none()
        );
    }

    #[test]
    fn pending_batch_intent_dto_includes_destination_address() {
        let record = PendingBatchIntentRecord {
            kind: PendingBatchIntentKind::CollaborativeExit,
            intent_id: Some("intent-exit".into()),
            onchain_outpoints: Vec::new(),
            vtxo_outpoints: vec![outpoint_record(sample_outpoint(0x22, 0))],
            amount_sats: 12_000,
            registered_at: 2,
            destination_address: Some("tb1qcollab".into()),
            lifecycle_phase: PendingBatchIntentLifecyclePhase::Processing,
        };
        let dto = pending_batch_intent_to_dto(record);
        assert_eq!(dto.destination_address.as_deref(), Some("tb1qcollab"));
        let json = serde_json::to_value(&dto).expect("serialize pending intent");
        assert_eq!(json["destinationAddress"], "tb1qcollab");
        assert_eq!(json["kind"], "collaborative_exit");
        assert_eq!(json["lifecyclePhase"], "processing");
    }
}
