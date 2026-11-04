//! Keeps one envelope edit out of the saved wallet until every hold is dropped.
//!
//! A durable partition write exports the whole envelope. A hold stops that
//! export. Dropping the last hold allows it again and does not write by itself.
//!
//! Two edits use this today. A creating open holds the envelope until the
//! recovery scan is known, and drops the new store when that scan must run
//! again. A seizure marks coins spent, then holds the envelope until the
//! account stores the notice. Each caller undoes its own edit before it drops
//! the hold on the abort path.

use std::sync::{Arc, Mutex};

/// One participant in an unexported envelope edit.
pub(crate) struct EnvelopeExportHold {
    holds: Arc<Mutex<u32>>,
}

impl EnvelopeExportHold {
    pub(crate) fn acquire(holds: &Arc<Mutex<u32>>) -> Result<Self, String> {
        let mut count = holds
            .lock()
            .map_err(|_| "Bark envelope export hold is poisoned".to_owned())?;
        *count = count.saturating_add(1);
        drop(count);
        Ok(Self {
            holds: Arc::clone(holds),
        })
    }
}

impl Drop for EnvelopeExportHold {
    fn drop(&mut self) {
        if let Ok(mut count) = self.holds.lock() {
            *count = count.saturating_sub(1);
        }
    }
}
