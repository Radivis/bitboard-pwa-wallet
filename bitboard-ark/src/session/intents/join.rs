use std::cell::RefCell;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use ark_client::{JoinBatchOutcome, RegisteredBatchIntent};
use bitcoin::{OutPoint, Txid};

use crate::api_types::{BATCH_JOIN_STATUS_COMPLETED, BatchJoinResultDto};
use crate::error::ArkResult;
use crate::persistence::{
    JsonPersistenceDb, PendingBatchIntentKind, PendingBatchIntentLifecyclePhase,
};
use crate::session::ArkSession;
use crate::session::mappers::current_unix_timestamp;

use super::mapping::{
    duplicated_input_waiting_record, outpoint_record, pending_batch_intent_to_dto,
    persist_and_waiting_join_result, record_from_registered_intent, waiting_join_result,
};

const BATCH_JOIN_ABORT_POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone)]
struct BatchJoinContext {
    kind: PendingBatchIntentKind,
    amount_sats: u64,
    destination_address: Option<String>,
}

thread_local! {
    static BATCH_JOIN_CONTEXT: RefCell<Option<BatchJoinContext>> = const { RefCell::new(None) };
    #[cfg(target_arch = "wasm32")]
    static ON_INTENT_REGISTERED_JS: RefCell<Option<js_sys::Function>> =
        const { RefCell::new(None) };
}

#[cfg(target_arch = "wasm32")]
async fn sleep_abort_poll() {
    bitboard_wasm_sleep::sleep_for(BATCH_JOIN_ABORT_POLL).await;
}

#[cfg(not(target_arch = "wasm32"))]
async fn sleep_abort_poll() {
    tokio::time::sleep(BATCH_JOIN_ABORT_POLL).await;
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn set_on_intent_registered_js(callback: Option<js_sys::Function>) {
    ON_INTENT_REGISTERED_JS.with(|slot| *slot.borrow_mut() = callback);
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn set_on_intent_registered_js(_callback: Option<js_sys::Function>) {}

pub(crate) fn install_intent_registered_hook(wallet_db: Arc<JsonPersistenceDb>) {
    ark_client::set_on_intent_registered(Some(Box::new(move |intent| {
        let wallet_db = Arc::clone(&wallet_db);
        let intent = intent.clone();
        Box::pin(async move {
            persist_intent_from_join_context(&wallet_db, &intent);
            notify_intent_registered_js(&intent).await;
            Ok(())
        })
    })));
}

fn persist_intent_from_join_context(wallet_db: &JsonPersistenceDb, intent: &RegisteredBatchIntent) {
    let Some(context) = BATCH_JOIN_CONTEXT.with(|slot| slot.borrow().clone()) else {
        return;
    };
    let mut record = record_from_registered_intent(
        context.kind,
        intent,
        context.amount_sats,
        current_unix_timestamp(),
    );
    record.destination_address = context.destination_address;
    record.lifecycle_phase = PendingBatchIntentLifecyclePhase::Processing;
    wallet_db.upsert_pending_batch_intent(record);
}

async fn notify_intent_registered_js(_intent: &RegisteredBatchIntent) {
    #[cfg(target_arch = "wasm32")]
    {
        let Some(callback) = ON_INTENT_REGISTERED_JS.with(|slot| slot.borrow().clone()) else {
            return;
        };
        let Some(context) = BATCH_JOIN_CONTEXT.with(|slot| slot.borrow().clone()) else {
            return;
        };
        let mut record = record_from_registered_intent(
            context.kind,
            _intent,
            context.amount_sats,
            current_unix_timestamp(),
        );
        record.destination_address = context.destination_address;
        record.lifecycle_phase = PendingBatchIntentLifecyclePhase::Processing;
        let dto = pending_batch_intent_to_dto(record);
        let Ok(value) = serde_wasm_bindgen::to_value(&dto) else {
            return;
        };
        let Ok(result) = callback.call1(&wasm_bindgen::JsValue::NULL, &value) else {
            return;
        };
        if result.is_undefined() || result.is_null() {
            return;
        }
        use wasm_bindgen::JsCast;
        if !result.is_instance_of::<js_sys::Promise>() {
            return;
        }
        let promise = js_sys::Promise::from(result);
        let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
    }
}

impl ArkSession {
    pub(crate) fn stamp_registered_intent_timed_out(
        &self,
        intent: &RegisteredBatchIntent,
        kind: PendingBatchIntentKind,
        amount_sats: u64,
        destination_address: Option<String>,
    ) -> BatchJoinResultDto {
        let onchain_records = intent
            .onchain_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        let vtxo_records = intent
            .vtxo_outpoints
            .iter()
            .copied()
            .map(outpoint_record)
            .collect::<Vec<_>>();
        if !self
            .wallet_db
            .stamp_overlapping_pending_batch_intent_timed_out(&onchain_records, &vtxo_records)
        {
            let mut record =
                record_from_registered_intent(kind, intent, amount_sats, current_unix_timestamp());
            record.destination_address = destination_address;
            record.lifecycle_phase = PendingBatchIntentLifecyclePhase::TimedOut;
            self.wallet_db.upsert_pending_batch_intent(record);
        }
        waiting_join_result(
            self.find_overlapping_pending_intent(&intent.onchain_outpoints, &intent.vtxo_outpoints)
                .map(pending_batch_intent_to_dto),
        )
    }

    pub(crate) async fn abort_in_flight_batch_join(&self) {
        ark_client::set_batch_join_abort(true);
        self.wait_until_batch_join_idle().await;
    }

    async fn wait_until_batch_join_idle(&self) {
        while ark_client::is_batch_join_in_flight() {
            sleep_abort_poll().await;
        }
    }

    pub(crate) async fn with_batch_join<F, Fut, T>(
        &self,
        kind: PendingBatchIntentKind,
        amount_sats: u64,
        destination_address: Option<String>,
        run: F,
    ) -> T
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = T>,
    {
        ark_client::set_batch_join_abort(false);
        BATCH_JOIN_CONTEXT.with(|slot| {
            *slot.borrow_mut() = Some(BatchJoinContext {
                kind,
                amount_sats,
                destination_address,
            });
        });
        let result = run().await;
        BATCH_JOIN_CONTEXT.with(|slot| *slot.borrow_mut() = None);
        self.promote_stranded_processing_intents_if_idle();
        result
    }

    pub(crate) fn batch_join_waiting_result(
        &self,
        kind: PendingBatchIntentKind,
        intent: &RegisteredBatchIntent,
        amount_sats: u64,
    ) -> BatchJoinResultDto {
        self.stamp_registered_intent_timed_out(intent, kind, amount_sats, None)
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
}
