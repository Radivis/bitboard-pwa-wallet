use crate::server::Info;
use crate::server::VirtualTxOutPoint;
use crate::ExplorerUtxo;
use crate::Vtxo;
use bitcoin::Amount;
use bitcoin::ScriptBuf;
use bitcoin::XOnlyPublicKey;
use std::collections::HashMap;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct VtxoList {
    // Offchain-spendable unspent
    pre_confirmed: Vec<VirtualTxOutPoint>,
    confirmed: Vec<VirtualTxOutPoint>,
    recoverable: Vec<VirtualTxOutPoint>,

    // Not offchain-spendable (upstream called this the "spent" bucket — misleading name)
    exiting: Vec<VirtualTxOutPoint>,
    finalized_unspendable: Vec<VirtualTxOutPoint>,
}

impl VtxoList {
    pub fn new(
        // The dust amount according to the Arkade server. Dust outputs are considered recoverable.
        dust: Amount,
        virtual_tx_outpoints: Vec<VirtualTxOutPoint>,
    ) -> Self {
        let mut recoverable = Vec::new();
        let mut exiting = Vec::new();
        let mut finalized_unspendable = Vec::new();
        let mut pre_confirmed = Vec::new();
        let mut confirmed = Vec::new();
        for virtual_tx_outpoint in virtual_tx_outpoints {
            // Bitboard vendor patch: exiting before recoverable (arkd recoverable_only excludes Unrolled).
            if virtual_tx_outpoint.is_unrolled && !virtual_tx_outpoint.is_spent {
                exiting.push(virtual_tx_outpoint);
            } else if virtual_tx_outpoint.is_recoverable(dust) {
                recoverable.push(virtual_tx_outpoint);
            } else if virtual_tx_outpoint.is_spent || virtual_tx_outpoint.is_swept {
                finalized_unspendable.push(virtual_tx_outpoint);
            } else if virtual_tx_outpoint.is_preconfirmed {
                pre_confirmed.push(virtual_tx_outpoint);
            } else {
                confirmed.push(virtual_tx_outpoint);
            }
        }

        VtxoList {
            pre_confirmed,
            confirmed,
            recoverable,
            exiting,
            finalized_unspendable,
        }
    }

    pub fn all(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.all_unspent().chain(self.unspendable())
    }

    pub fn all_unspent(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.pre_confirmed
            .iter()
            .chain(self.confirmed.iter())
            .chain(self.recoverable.iter())
    }

    /// VTXOs that are in a state that allows for unilateral exit.
    ///
    /// This does _not_ mean that the VTXOs are readily spendable on-chain, just that their ancestor
    /// chain can still be published.
    pub fn could_exit_unilaterally(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.pre_confirmed.iter().chain(self.confirmed.iter())
    }

    /// VTXOs that can be spent in an offchain transaction.
    pub fn spendable_offchain(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.pre_confirmed.iter().chain(self.confirmed.iter())
    }

    /// VTXOs that can be spent in an offchain transaction at `now_unix_secs`.
    ///
    /// This excludes otherwise-spendable VTXOs minted under a deprecated signer whose
    /// cooperative-sign window has closed. Those VTXOs cannot be forfeited by the server anymore;
    /// they become usable again only after they expire and move into the recovery path.
    pub fn spendable_offchain_at<'a, F>(
        &'a self,
        server_info: &'a Info,
        now_unix_secs: i64,
        server_pk_for_script: F,
    ) -> impl Iterator<Item = &'a VirtualTxOutPoint> + 'a
    where
        F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey> + 'a,
    {
        self.spendable_offchain().filter(move |vtxo| {
            !server_pk_for_script(&vtxo.script)
                .map(|server_pk| server_info.signer_requires_recovery_at(server_pk, now_unix_secs))
                .unwrap_or(false)
        })
    }

    /// Otherwise-spendable VTXOs blocked only by a deprecated signer's closed cooperative-sign
    /// window. These remain wallet funds, but they are pending recovery until expiry.
    pub fn pending_recovery_due_to_signer_at<'a, F>(
        &'a self,
        server_info: &'a Info,
        now_unix_secs: i64,
        server_pk_for_script: F,
    ) -> impl Iterator<Item = &'a VirtualTxOutPoint> + 'a
    where
        F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey> + 'a,
    {
        self.spendable_offchain().filter(move |vtxo| {
            server_pk_for_script(&vtxo.script)
                .map(|server_pk| server_info.signer_requires_recovery_at(server_pk, now_unix_secs))
                .unwrap_or(false)
        })
    }

    /// Unspent VTXOs that may be included in a cooperative batch settlement at `now_unix_secs`.
    ///
    /// Recoverable VTXOs are always safe: they no longer need a server forfeit signature. Healthy
    /// VTXOs still need that signature, so VTXOs under an expired deprecated signer are excluded.
    pub fn batch_settleable_at<'a, F>(
        &'a self,
        server_info: &'a Info,
        now_unix_secs: i64,
        server_pk_for_script: F,
    ) -> impl Iterator<Item = &'a VirtualTxOutPoint> + 'a
    where
        F: Fn(&ScriptBuf) -> Option<XOnlyPublicKey> + 'a,
    {
        let dust = server_info.dust;
        self.all_unspent().filter(move |vtxo| {
            vtxo.is_recoverable(dust)
                || !server_pk_for_script(&vtxo.script)
                    .map(|server_pk| {
                        server_info.signer_requires_recovery_at(server_pk, now_unix_secs)
                    })
                    .unwrap_or(false)
        })
    }

    pub fn pre_confirmed(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.pre_confirmed.iter()
    }

    pub fn confirmed(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.confirmed.iter()
    }

    /// Returns the list of recoverable VTXOs.
    ///
    /// A VTXO is recoverable if it:
    ///
    /// - has expired;
    /// - was swept already; or
    /// - is sub-dust.
    ///
    /// Unrolled VTXOs (unilateral exit in progress) are never recoverable — see [`Self::exiting`].
    pub fn recoverable(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.recoverable.iter()
    }

    /// VTXOs in unilateral exit awaiting on-chain completion (`is_unrolled && !is_spent`).
    pub fn exiting(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.exiting.iter()
    }

    /// VTXOs that are not offchain-spendable: in-progress unilateral exits plus finalized outputs.
    ///
    /// Upstream ark-core named this bucket `spent()`, which is misleading — it is **not** the
    /// `is_spent` flag alone. Prefer this method over [`Self::spent`].
    pub fn unspendable(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.exiting
            .iter()
            .chain(self.finalized_unspendable.iter())
    }

    /// VTXOs that are already on-chain and can be spent unilaterally (the exit path is active).
    pub fn exit_ready(
        &self,
        now: Duration,
        // Corresponds to every VTXO in `vtxos` which has been found on the blockchain.
        explorer_utxos: Vec<ExplorerUtxo>,
        // TODO: We probably shouldn't involve the opinionated `Vtxo` type here.
        vtxos: HashMap<ScriptBuf, Vtxo>,
    ) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.all_unspent().filter(move |v| {
            match explorer_utxos
                .iter()
                .find(|explorer_utxo| explorer_utxo.outpoint == v.outpoint)
            {
                // VTXOs that have been confirmed on the blockchain.
                Some(ExplorerUtxo {
                    confirmation_blocktime: Some(confirmation_blocktime),
                    confirmations,
                    ..
                }) => {
                    // VTXOs with an _active_ exit path. These should be claimed unilaterally.
                    if let Some(vtxo) = vtxos.get(&v.script) {
                        vtxo.can_be_claimed_unilaterally_by_owner(
                            now,
                            Duration::from_secs(*confirmation_blocktime),
                            *confirmations,
                        )
                    } else {
                        false
                    }
                }
                _ => false,
            }
        })
    }

    /// Compatibility alias for [`Self::unspendable`].
    ///
    /// **Not** equivalent to the `is_spent` flag on [`VirtualTxOutPoint`]. Includes in-progress
    /// unilateral exits (`is_unrolled && !is_spent`) as well as finalized outputs.
    pub fn spent(&self) -> impl Iterator<Item = &VirtualTxOutPoint> {
        self.unspendable()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::hashes::Hash;
    use bitcoin::{OutPoint, ScriptBuf, Txid};

    const DUST: Amount = Amount::from_sat(330);

    fn sample_vtp(
        vout: u32,
        amount_sats: u64,
        expires_at: i64,
        flags: VtpFlags,
    ) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([vout as u8; 32]), vout),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(amount_sats),
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

    fn expired_timestamp() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("valid duration")
            .as_secs() as i64
            - 1
    }

    #[test]
    fn unrolled_in_progress_goes_to_exiting_not_recoverable() {
        let vtxo_list = VtxoList::new(
            DUST,
            vec![sample_vtp(
                0,
                25_000,
                expired_timestamp(),
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: true,
                    is_unrolled: true,
                    is_spent: false,
                },
            )],
        );
        assert_eq!(vtxo_list.exiting().count(), 1);
        assert_eq!(vtxo_list.recoverable().count(), 0);
    }

    #[test]
    fn unrolled_completed_goes_to_unspendable_not_exiting() {
        let vtxo_list = VtxoList::new(
            DUST,
            vec![sample_vtp(
                1,
                25_000,
                expired_timestamp(),
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: true,
                    is_spent: true,
                },
            )],
        );
        assert_eq!(vtxo_list.exiting().count(), 0);
        assert_eq!(vtxo_list.unspendable().count(), 1);
    }

    #[test]
    fn unspendable_equals_spent_compat() {
        let vtxo_list = VtxoList::new(
            DUST,
            vec![
                sample_vtp(
                    0,
                    25_000,
                    expired_timestamp(),
                    VtpFlags {
                        is_preconfirmed: false,
                        is_swept: false,
                        is_unrolled: true,
                        is_spent: false,
                    },
                ),
                sample_vtp(
                    1,
                    30_000,
                    expired_timestamp(),
                    VtpFlags {
                        is_preconfirmed: false,
                        is_swept: false,
                        is_unrolled: true,
                        is_spent: true,
                    },
                ),
            ],
        );
        let unspendable: Vec<_> = vtxo_list.unspendable().map(|v| v.outpoint).collect();
        let spent: Vec<_> = vtxo_list.spent().map(|v| v.outpoint).collect();
        assert_eq!(unspendable, spent);
    }

    #[test]
    fn exiting_is_subset_of_unspendable() {
        let vtxo_list = VtxoList::new(
            DUST,
            vec![sample_vtp(
                2,
                25_000,
                expired_timestamp(),
                VtpFlags {
                    is_preconfirmed: false,
                    is_swept: true,
                    is_unrolled: true,
                    is_spent: false,
                },
            )],
        );
        let exiting: Vec<_> = vtxo_list.exiting().map(|v| v.outpoint).collect();
        let unspendable: Vec<_> = vtxo_list.unspendable().map(|v| v.outpoint).collect();
        for outpoint in exiting {
            assert!(unspendable.contains(&outpoint));
        }
    }

    #[test]
    fn is_recoverable_false_when_unrolled_even_if_expired() {
        let vtxo = sample_vtp(
            3,
            25_000,
            expired_timestamp(),
            VtpFlags {
                is_preconfirmed: false,
                is_swept: true,
                is_unrolled: true,
                is_spent: false,
            },
        );
        assert!(!vtxo.is_recoverable(DUST));
    }
}
