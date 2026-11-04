//! Holds swept-coin spent marks until the seizure notice is stored.
//!
//! A durable exit-row write exports the whole envelope. While this hold is
//! active that export waits, so the spent mark is not saved before the notice.

use std::cell::RefCell;

use crate::exit_seizure::SweptVtxoPreviousState;
use crate::record_store::DeferredDurableFlush;

struct SweptVtxoMarkHold {
    /// Kept so its drop allows durable flushes again.
    _deferral: DeferredDurableFlush,
    previous: Vec<SweptVtxoPreviousState>,
}

thread_local! {
    static SWEPT_VTXO_MARK_HOLD: RefCell<Option<SweptVtxoMarkHold>> = const { RefCell::new(None) };
}

/// Starts a hold. A second call keeps the first deferral and adds the coins.
pub(crate) fn begin(deferral: DeferredDurableFlush, previous: Vec<SweptVtxoPreviousState>) {
    SWEPT_VTXO_MARK_HOLD.with(|slot| {
        let mut hold = slot.borrow_mut();
        if let Some(existing) = hold.as_mut() {
            existing.previous.extend(previous);
            // Dropping this second guard would turn flushes back on.
            std::mem::forget(deferral);
            return;
        }
        *hold = Some(SweptVtxoMarkHold {
            _deferral: deferral,
            previous,
        });
    });
}

pub(crate) fn add_previous(previous: Vec<SweptVtxoPreviousState>) {
    SWEPT_VTXO_MARK_HOLD.with(|slot| {
        if let Some(hold) = slot.borrow_mut().as_mut() {
            hold.previous.extend(previous);
        }
    });
}

pub(crate) fn is_held() -> bool {
    SWEPT_VTXO_MARK_HOLD.with(|slot| slot.borrow().is_some())
}

/// Drops the hold and allows durable flushes again. Does not write the envelope.
pub(crate) fn release() {
    SWEPT_VTXO_MARK_HOLD.with(|slot| {
        slot.borrow_mut().take();
    });
}

pub(crate) fn take_previous() -> Vec<SweptVtxoPreviousState> {
    SWEPT_VTXO_MARK_HOLD.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map(|hold| std::mem::take(&mut hold.previous))
            .unwrap_or_default()
    })
}

pub(crate) fn put_previous_back(previous: Vec<SweptVtxoPreviousState>) {
    SWEPT_VTXO_MARK_HOLD.with(|slot| {
        if let Some(hold) = slot.borrow_mut().as_mut() {
            hold.previous = previous;
        }
    });
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use bark::persist::adaptor::partition;
    use bark::persist::adaptor::{Record, SortKey, StorageAdaptor};

    use super::{add_previous, begin, is_held, put_previous_back, release, take_previous};
    use crate::exit_seizure::SweptVtxoPreviousState;
    use crate::record_store::{NativeDurableFlushHook, SharedRecordStore};

    fn spent_coin() -> SweptVtxoPreviousState {
        SweptVtxoPreviousState {
            vtxo_id: bark::ark::VtxoId::from_slice(&[7u8; 36]).expect("36 bytes"),
            state: bark::vtxo::VtxoState::Spendable,
        }
    }

    fn record(partition_id: u8, pk: &str, data: &[u8]) -> Record {
        Record {
            partition: partition_id,
            pk: pk.as_bytes().to_vec(),
            sort_key: Some(SortKey::u32_asc(1)),
            data: data.to_vec(),
        }
    }

    fn flush_log() -> (Arc<Mutex<Vec<String>>>, NativeDurableFlushHook) {
        let envelopes = Arc::new(Mutex::new(Vec::new()));
        let flushed = Arc::clone(&envelopes);
        let hook: NativeDurableFlushHook = Arc::new(move |record_envelope| {
            flushed.lock().expect("flush log").push(record_envelope);
            Ok(())
        });
        (envelopes, hook)
    }

    fn flushed_count(envelopes: &Mutex<Vec<String>>) -> usize {
        envelopes.lock().expect("flush log").len()
    }

    #[tokio::test]
    async fn an_exit_row_does_not_export_a_vtxo_write_while_swept_marks_are_held() {
        let mut store = SharedRecordStore::empty();
        let (envelopes, hook) = flush_log();
        store.set_durable_flush_hook(hook);
        let deferral = store
            .defer_durable_flushes_until_drop()
            .expect("flush deferral");
        begin(deferral, vec![spent_coin()]);

        store
            .put(record(partition::VTXO, "swept-coin", b"spent"))
            .await
            .unwrap();
        store
            .put(record(partition::EXIT_VTXO, "exit-row", b"progress"))
            .await
            .unwrap();

        assert_eq!(flushed_count(&envelopes), 0);
        assert!(is_held());
        release();
        assert!(!is_held());
        assert_eq!(flushed_count(&envelopes), 0);

        store
            .put(record(partition::EXIT_VTXO, "later-exit", b"later"))
            .await
            .unwrap();

        let flushed = envelopes.lock().expect("flush log");
        assert_eq!(flushed.len(), 1);
        let restored =
            SharedRecordStore::from_encoded_envelope(&flushed[0]).expect("flushed envelope");
        drop(flushed);
        let swept = restored
            .get(partition::VTXO, b"swept-coin")
            .await
            .unwrap()
            .expect("spent mark is in the later export");
        assert_eq!(swept.data, b"spent");
    }

    #[tokio::test]
    async fn a_failed_restore_keeps_the_hold_so_the_exit_row_does_not_export() {
        let mut store = SharedRecordStore::empty();
        let (envelopes, hook) = flush_log();
        store.set_durable_flush_hook(hook);
        let deferral = store
            .defer_durable_flushes_until_drop()
            .expect("flush deferral");
        begin(deferral, vec![spent_coin()]);

        add_previous(vec![spent_coin()]);
        let previous = take_previous();
        assert_eq!(previous.len(), 2);
        assert_eq!(previous[0].vtxo_id, spent_coin().vtxo_id);
        assert_eq!(previous[0].state, bark::vtxo::VtxoState::Spendable);
        assert!(is_held());
        put_previous_back(previous);
        store
            .put(record(partition::EXIT_VTXO, "exit-row", b"progress"))
            .await
            .unwrap();

        assert_eq!(flushed_count(&envelopes), 0);
        assert!(is_held());
        release();
    }
}
