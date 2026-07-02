#[cfg(test)]
mod exit_candidate_tests {
    use crate::constants::{VTXO_STATUS_RECOVERABLE, VTXO_STATUS_SETTLED};
    use crate::session::mappers::{current_unix_timestamp, map_exit_candidate};
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::Amount;
    use bitcoin::OutPoint;
    use bitcoin::ScriptBuf;
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    const DUST: Amount = Amount::from_sat(330);

    fn sample_vtp(expires_at: i64, flags: VtpFlags) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::all_zeros(), 0),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(180_603),
            script: ScriptBuf::new(),
            is_preconfirmed: flags.is_preconfirmed,
            is_swept: flags.is_swept,
            is_unrolled: flags.is_unrolled,
            is_spent: flags.is_spent,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    struct VtpFlags {
        is_preconfirmed: bool,
        is_swept: bool,
        is_unrolled: bool,
        is_spent: bool,
    }

    #[test]
    fn settled_vtxo_can_start_unroll() {
        let future_expiry = current_unix_timestamp() + 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                future_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, VTXO_STATUS_SETTLED);
        assert!(row.can_start_unroll);
        assert!(!row.can_complete);
    }

    #[test]
    fn expired_recoverable_vtxo_cannot_start_unroll() {
        let past_expiry = current_unix_timestamp() - 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                past_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, VTXO_STATUS_RECOVERABLE);
        assert!(!row.can_start_unroll);
        assert!(!row.can_complete);
    }

    #[test]
    fn unrolled_vtxo_can_complete_but_not_start_unroll() {
        let future_expiry = current_unix_timestamp() + 86_400;
        let row = map_exit_candidate(
            &sample_vtp(
                future_expiry,
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: true,
                    is_spent: false,
                },
            ),
            DUST,
        );

        assert_eq!(row.virtual_status_state, "unrolled");
        assert!(!row.can_start_unroll);
        assert!(row.can_complete);
    }
}
