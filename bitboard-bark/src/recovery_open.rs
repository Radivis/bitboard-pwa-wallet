//! Seed-recovery result for the open that creates a Bark record.
//!
//! bark-wallet reads the recovery mailbox only while creating the wallet.
//! A failed or unfinished scan still returns a wallet. Keeping that record
//! would make every later open skip the scan. This module drops that record
//! unless the scan is retry-clean.

use std::sync::{Arc, Mutex};

use crate::record_store::{DeferredDurableFlush, SharedRecordStore};

/// Shown on the Bark session error screen. Retry opens the same empty envelope.
pub(crate) const RECOVERY_SCAN_INCOMPLETE_MESSAGE: &str =
    "Bark recovery did not finish. Retrying this open scans the recovery mailbox again.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RecoveryOpenDisposition {
    Keep,
    Drop,
}

/// Keep a finished scan, including one that only leaves ids past the key gap.
/// Drop when the scan failed or left ids that a later scan can still check.
pub(crate) fn recovery_open_disposition(status: &bark::RecoveryStatus) -> RecoveryOpenDisposition {
    match status {
        bark::RecoveryStatus::NotRun => RecoveryOpenDisposition::Keep,
        bark::RecoveryStatus::Failed(_) => RecoveryOpenDisposition::Drop,
        bark::RecoveryStatus::Completed(report) => {
            if report.failed().is_empty() {
                RecoveryOpenDisposition::Keep
            } else {
                RecoveryOpenDisposition::Drop
            }
        }
    }
}

/// Ends the deferred-flush window for an empty-envelope open.
///
/// Drop clears the in-memory store before flushes resume, so the exit rows
/// written during the scan are not exported. Keep leaves those rows for the
/// caller's end-of-open save.
pub(crate) fn finish_deferred_recovery_open(
    store: &SharedRecordStore,
    deferred_flush: DeferredDurableFlush,
    disposition: RecoveryOpenDisposition,
) -> Result<(), String> {
    match disposition {
        RecoveryOpenDisposition::Keep => Ok(()),
        RecoveryOpenDisposition::Drop => {
            store.clear_records()?;
            drop(deferred_flush);
            Err(RECOVERY_SCAN_INCOMPLETE_MESSAGE.to_owned())
        }
    }
}

/// Empty-envelope opens defer durable flushes until [`Self::finish`].
pub(crate) struct RecoveryOpen {
    status_slot: Arc<Mutex<Option<bark::RecoveryStatus>>>,
    deferred_flush: Option<DeferredDurableFlush>,
}

impl RecoveryOpen {
    /// Starts the window before `Wallet::open`. An existing record is left alone.
    pub(crate) fn begin(store: &SharedRecordStore) -> Self {
        let scan_may_create = !store.has_wallet_properties();
        Self {
            status_slot: Arc::new(Mutex::new(None)),
            deferred_flush: scan_may_create.then(|| store.defer_durable_flushes()),
        }
    }

    pub(crate) fn callback(&self) -> Box<dyn FnOnce(bark::RecoveryStatus) + Send + Sync> {
        let status_slot = Arc::clone(&self.status_slot);
        Box::new(move |status| {
            if let Ok(mut guard) = status_slot.lock() {
                *guard = Some(status);
            }
        })
    }

    /// Keeps a retry-clean scan. Drops the new record when the scan must run again.
    pub(crate) fn finish(self, store: &SharedRecordStore) -> Result<(), String> {
        let Some(deferred_flush) = self.deferred_flush else {
            return Ok(());
        };
        let disposition = disposition_from_slot(&self.status_slot);
        finish_deferred_recovery_open(store, deferred_flush, disposition)
    }
}

fn disposition_from_slot(
    status_slot: &Mutex<Option<bark::RecoveryStatus>>,
) -> RecoveryOpenDisposition {
    let status = status_slot.lock().ok().and_then(|mut guard| guard.take());
    match status {
        Some(status) => recovery_open_disposition(&status),
        // bark calls the callback on every successful open. A missing status
        // on a creating open must not stamp a record we cannot scan again.
        None => RecoveryOpenDisposition::Drop,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use bark::persist::adaptor::{Record, StorageAdaptor, partition};
    use bark::{RecoveryReport, RecoveryStatus};
    use bitcoin::hashes::Hash;
    use bitcoin::{OutPoint, Txid};

    use super::{
        RECOVERY_SCAN_INCOMPLETE_MESSAGE, RecoveryOpen, RecoveryOpenDisposition,
        recovery_open_disposition,
    };
    use crate::record_store::SharedRecordStore;

    #[test]
    fn recovery_open_disposition_keeps_a_finished_scan_and_drops_unchecked_ids() {
        assert_eq!(
            recovery_open_disposition(&RecoveryStatus::NotRun),
            RecoveryOpenDisposition::Keep,
        );

        assert_eq!(
            recovery_open_disposition(&RecoveryStatus::Completed(RecoveryReport::default())),
            RecoveryOpenDisposition::Keep,
        );

        let mut unchecked = RecoveryReport::default();
        unchecked.push_failed(dummy_vtxo_id(1), None);
        assert_eq!(
            recovery_open_disposition(&RecoveryStatus::Completed(unchecked)),
            RecoveryOpenDisposition::Drop,
        );

        let mut gap_limit_only = RecoveryReport::default();
        gap_limit_only.push_foreign(&board_vtxo());
        assert!(
            gap_limit_only.failed().is_empty(),
            "a gap-limit id is not an unchecked id",
        );
        assert!(
            !gap_limit_only.foreign().is_empty(),
            "the fixture must be past the key gap, not an empty scan",
        );
        assert_eq!(
            recovery_open_disposition(&RecoveryStatus::Completed(gap_limit_only)),
            RecoveryOpenDisposition::Keep,
        );

        assert_eq!(
            recovery_open_disposition(&RecoveryStatus::Failed(anyhow::anyhow!("mailbox down"))),
            RecoveryOpenDisposition::Drop,
        );
    }

    #[tokio::test]
    async fn dropped_empty_envelope_open_exports_no_properties_and_does_not_flush() {
        let mut store = SharedRecordStore::empty();
        let flushes = FlushLog::install(&mut store);
        let recovery_open = RecoveryOpen::begin(&store);
        let report_failed_scan = recovery_open.callback();
        store.put(properties_record()).await.expect("properties");
        store.put(exit_record()).await.expect("exit row");
        report_failed_scan(RecoveryStatus::Failed(anyhow::anyhow!("mailbox down")));

        let error = recovery_open.finish(&store).expect_err("failed scan");

        assert_eq!(error, RECOVERY_SCAN_INCOMPLETE_MESSAGE);
        assert!(
            flushes.envelopes.lock().expect("flush log").is_empty(),
            "a dropped scan must not stamp the envelope",
        );
        assert!(
            store_record(&store, partition::PROPERTIES, b"")
                .await
                .is_none()
        );
        assert!(
            store_record(&store, partition::EXIT_VTXO, b"exit")
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn kept_empty_envelope_open_exports_properties_and_the_exit_row() {
        let mut store = SharedRecordStore::empty();
        let flushes = FlushLog::install(&mut store);
        let recovery_open = RecoveryOpen::begin(&store);
        let report_finished_scan = recovery_open.callback();
        store.put(properties_record()).await.expect("properties");
        store.put(exit_record()).await.expect("exit row");
        report_finished_scan(RecoveryStatus::Completed(RecoveryReport::default()));

        recovery_open.finish(&store).expect("finished scan");

        assert!(
            flushes.envelopes.lock().expect("flush log").is_empty(),
            "the deferred window does not flush; the caller saves after open",
        );
        assert!(
            store_record(&store, partition::PROPERTIES, b"")
                .await
                .is_some()
        );
        assert!(
            store_record(&store, partition::EXIT_VTXO, b"exit")
                .await
                .is_some()
        );

        store
            .put(exit_record())
            .await
            .expect("exit write after the window");
        assert_eq!(
            flushes.envelopes.lock().expect("flush log").len(),
            1,
            "flushes resume after a kept scan",
        );
    }

    #[tokio::test]
    async fn existing_envelope_exit_write_still_flushes() {
        let mut store = SharedRecordStore::empty();
        store.put(properties_record()).await.expect("properties");
        assert!(store.has_wallet_properties());
        let flushes = FlushLog::install(&mut store);
        let recovery_open = RecoveryOpen::begin(&store);

        store.put(exit_record()).await.expect("exit row");
        recovery_open.finish(&store).expect("existing record stays");

        assert_eq!(flushes.envelopes.lock().expect("flush log").len(), 1);
        assert!(
            store_record(&store, partition::PROPERTIES, b"")
                .await
                .is_some()
        );
        assert!(
            store_record(&store, partition::EXIT_VTXO, b"exit")
                .await
                .is_some()
        );
    }

    struct FlushLog {
        envelopes: Arc<Mutex<Vec<String>>>,
    }

    impl FlushLog {
        fn install(store: &mut SharedRecordStore) -> Self {
            let envelopes = Arc::new(Mutex::new(Vec::new()));
            let recorded = Arc::clone(&envelopes);
            store.set_durable_flush_hook(Arc::new(move |envelope| {
                recorded.lock().expect("flush log").push(envelope);
                Ok(())
            }));
            Self { envelopes }
        }
    }

    fn properties_record() -> Record {
        Record {
            partition: partition::PROPERTIES,
            pk: Vec::new(),
            sort_key: None,
            data: b"properties".to_vec(),
        }
    }

    fn exit_record() -> Record {
        Record {
            partition: partition::EXIT_VTXO,
            pk: b"exit".to_vec(),
            sort_key: None,
            data: b"exit-row".to_vec(),
        }
    }

    async fn store_record(
        store: &SharedRecordStore,
        partition_id: u8,
        pk: &[u8],
    ) -> Option<Record> {
        store.get(partition_id, pk).await.expect("record read")
    }

    fn dummy_vtxo_id(vout: u32) -> ark::VtxoId {
        OutPoint::new(Txid::from_byte_array([0; 32]), vout).into()
    }

    fn board_vtxo() -> ark::Vtxo<ark::vtxo::Full> {
        ark::ProtocolEncoding::deserialize_hex(
            "02001027000000000000928a01000365a81233741893bbe2461b8d479dadc5880594fe6f7479180d5843820af72b62e0075111d0df3738fe77c8f05b0f71292ae6ae5eddf911f8d2bb4dbde598fcbe768f00000000010102030a752219f1b94bbdf8994a0a980cdda08c2ad094cb29dd834878db6dee1612ee0365a81233741893bbe2461b8d479dadc5880594fe6f7479180d5843820af72b629c9c63d9c0f739011368e00c2441d85816c01d637da8d57ac343c95982dd3604d8bf847bcf8a2aac44483d7ea01ec9a99f7720d0694cb3cdd3cbcca97504adaf01004a0100000000000000030a752219f1b94bbdf8994a0a980cdda08c2ad094cb29dd834878db6dee1612ee24e9a421d9018690eea79b11e4e4fe59d36aa8f46d110017e09abe350b5e315600000000",
        )
        .expect("board vtxo fixture")
    }
}
