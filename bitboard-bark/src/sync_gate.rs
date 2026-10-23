/// Whether this process has finished a successful Bark sync.
/// `Wallet::balance` is only meaningful after that sync. A failed attempt must
/// not mark the gate, and must not clear a mark from an earlier success.
#[derive(Debug, Clone, Copy)]
pub struct BarkSessionSyncGate {
    synced_this_session: bool,
}

impl BarkSessionSyncGate {
    pub const fn new() -> Self {
        Self {
            synced_this_session: false,
        }
    }

    pub fn clear(&mut self) {
        self.synced_this_session = false;
    }

    pub fn mark_synced(&mut self) {
        self.synced_this_session = true;
    }

    pub fn require_synced(&self) -> Result<(), &'static str> {
        if self.synced_this_session {
            Ok(())
        } else {
            Err("Bark balance requires a sync in this session")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::BarkSessionSyncGate;

    #[test]
    fn balance_is_refused_until_a_successful_sync() {
        let mut gate = BarkSessionSyncGate::new();
        assert_eq!(
            gate.require_synced(),
            Err("Bark balance requires a sync in this session")
        );

        // A failed sync does not call mark_synced.
        assert!(gate.require_synced().is_err());

        gate.mark_synced();
        assert!(gate.require_synced().is_ok());
    }

    #[test]
    fn a_later_failure_does_not_clear_an_earlier_success() {
        let mut gate = BarkSessionSyncGate::new();
        gate.mark_synced();
        // The failure path leaves the gate marked so a later balance read still works.
        assert!(gate.require_synced().is_ok());
    }

    #[test]
    fn opening_or_closing_the_session_clears_the_sync_gate() {
        let mut gate = BarkSessionSyncGate::new();
        gate.mark_synced();
        gate.clear();
        assert!(gate.require_synced().is_err());
    }
}
