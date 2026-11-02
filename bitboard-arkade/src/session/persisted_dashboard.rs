use crate::api_types::{BalanceDto, PendingBatchIntentDto, PersistedDashboardDto};
use crate::balance_display::{ArkadeBalanceInputs, build_arkade_balance_dto};
use crate::error::ArkResult;
use crate::offchain_snapshot::OffchainBalanceBuckets;
use crate::session::vtxo::RecoverableVtxoBuckets;

use super::ArkadeSession;
use super::payments::persisted_payments_from_snapshot;

/// Balance from snapshot buckets. Boarding amounts stay 0 until a live scan.
pub(crate) fn balance_from_persisted_snapshot(
    offchain_buckets: OffchainBalanceBuckets,
    recoverable_buckets: &RecoverableVtxoBuckets,
    onchain_confirmed_sats: u64,
    unilateral_exit_in_progress_sats: u64,
    collaborative_exit_in_progress_sats: u64,
    unilateral_exit_spend_lock_sats: u64,
    pending_batch_intents: Vec<PendingBatchIntentDto>,
) -> BalanceDto {
    build_arkade_balance_dto(ArkadeBalanceInputs {
        pre_confirmed_sats: offchain_buckets.pre_confirmed_sats,
        confirmed_offchain_sats: offchain_buckets.confirmed_sats,
        recoverable_settleable_sats: recoverable_buckets.settleable.total_sats,
        recoverable_settleable_vtxo_count: recoverable_buckets.settleable.count,
        recoverable_pending_operator_sweep_sats: recoverable_buckets
            .pending_operator_sweep
            .total_sats,
        recoverable_pending_operator_sweep_vtxo_count: recoverable_buckets
            .pending_operator_sweep
            .count,
        onchain_confirmed_sats,
        boarding_spendable_sats: 0,
        boarding_pending_sats: 0,
        unilateral_exit_in_progress_sats,
        collaborative_exit_in_progress_sats,
        unilateral_exit_spend_lock_sats,
        pending_recovery_due_to_expired_signer_sats: offchain_buckets
            .pending_recovery_due_to_expired_signer_sats,
        pending_batch_intents,
    })
}

impl ArkadeSession {
    /// Dashboard from the open session's envelope. Does not list boarding addresses
    /// or call the operator indexer.
    pub fn persisted_dashboard(&self) -> ArkResult<PersistedDashboardDto> {
        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            self.reconcile_pending_exit_deductions_with_snapshot(&snapshot)?;
        }

        let offchain_buckets = self.resolve_offchain_balance_buckets_from_snapshot()?;
        let recoverable_buckets = self.recoverable_vtxo_buckets_from_persisted_snapshot()?;
        let (
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
        ) = self.exit_balance_components()?;
        let onchain = self.client.onchain_wallet_balance()?;
        let balance = balance_from_persisted_snapshot(
            offchain_buckets,
            &recoverable_buckets,
            onchain.confirmed.to_sat(),
            unilateral_exit_in_progress_sats,
            collaborative_exit_in_progress_sats,
            unilateral_exit_spend_lock_sats,
            self.pending_batch_intents_dto(),
        );
        let payments = match self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            Some(snapshot) => persisted_payments_from_snapshot(snapshot)?,
            None => Vec::new(),
        };
        let receive_address = self.peek_offchain_address()?;
        Ok(PersistedDashboardDto {
            balance,
            payments,
            receive_address,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::collections::HashMap;
    use std::str::FromStr;

    use ark_client::{Blockchain, Error, SpendStatus, TxStatus};
    use ark_core::server::{DeprecatedSigner, Info};
    use bitcoin::hashes::Hash;
    use bitcoin::secp256k1::PublicKey;
    use bitcoin::{Amount, Network, OutPoint, ScriptBuf, Transaction, Txid};

    use crate::offchain_snapshot::{
        offchain_balance_buckets_from_snapshot,
        snapshot_from_virtual_tx_outpoints_with_script_lookup,
    };
    use crate::session::payments::persisted_payments_from_snapshot;
    use crate::session::vtxo::{RecoverableVtxoBuckets, RecoverableVtxoSummary};

    use super::balance_from_persisted_snapshot;

    /// Blockchain that fails the test if a persisted read lists an address.
    struct PanickingBlockchain;

    impl Blockchain for PanickingBlockchain {
        async fn find_outpoints(
            &self,
            _address: &bitcoin::Address,
        ) -> Result<Vec<ark_core::ExplorerUtxo>, Error> {
            panic!("persisted dashboard listed a boarding address");
        }

        async fn find_tx(&self, _txid: &Txid) -> Result<Option<Transaction>, Error> {
            panic!("persisted dashboard fetched a transaction");
        }

        async fn get_tx_status(&self, _txid: &Txid) -> Result<TxStatus, Error> {
            panic!("persisted dashboard fetched a transaction status");
        }

        async fn get_output_status(&self, _txid: &Txid, _vout: u32) -> Result<SpendStatus, Error> {
            panic!("persisted dashboard fetched an output status");
        }

        async fn broadcast(&self, _tx: &Transaction) -> Result<(), Error> {
            panic!("persisted dashboard broadcast a transaction");
        }

        async fn get_fee_rate(&self) -> Result<f64, Error> {
            panic!("persisted dashboard fetched a fee rate");
        }

        async fn broadcast_package(&self, _txs: &[&Transaction]) -> Result<(), Error> {
            panic!("persisted dashboard broadcast a package");
        }
    }

    fn empty_recoverable() -> RecoverableVtxoBuckets {
        let summary = RecoverableVtxoSummary {
            outpoints: Vec::new(),
            total_sats: 0,
            count: 0,
        };
        RecoverableVtxoBuckets {
            settleable: RecoverableVtxoSummary {
                outpoints: Vec::new(),
                total_sats: summary.total_sats,
                count: summary.count,
            },
            pending_operator_sweep: summary,
        }
    }

    fn server_info(current_hex: &str, deprecated: Vec<(&str, i64)>) -> Info {
        let dummy_address: bitcoin::Address<bitcoin::address::NetworkUnchecked> =
            "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
                .parse()
                .unwrap();
        Info {
            version: "1".into(),
            signer_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_pk: PublicKey::from_str(current_hex).expect("valid key"),
            forfeit_address: dummy_address.assume_checked(),
            checkpoint_tapscript: ScriptBuf::new(),
            network: Network::Signet,
            session_duration: 0,
            unilateral_exit_delay: bitcoin::Sequence::ZERO,
            boarding_exit_delay: bitcoin::Sequence::ZERO,
            utxo_min_amount: None,
            utxo_max_amount: None,
            vtxo_min_amount: None,
            vtxo_max_amount: None,
            dust: Amount::ZERO,
            fees: None,
            scheduled_session: None,
            deprecated_signers: deprecated
                .into_iter()
                .map(|(key, cutoff)| DeprecatedSigner {
                    pk: PublicKey::from_str(key).expect("valid key"),
                    cutoff_date: cutoff,
                })
                .collect(),
            service_status: HashMap::new(),
            digest: String::new(),
            max_tx_weight: 0,
            max_op_return_outputs: 0,
        }
    }

    #[test]
    fn persisted_dashboard_with_snapshot_does_not_touch_the_blockchain() {
        let _blockchain = PanickingBlockchain;
        let script = ScriptBuf::from_bytes(vec![0x51]);
        let future_expiry = 2_000_000_000_i64;
        let vtxo = ark_core::server::VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::from_byte_array([7; 32]), 0),
            created_at: future_expiry - 86_400,
            expires_at: future_expiry,
            amount: Amount::from_sat(50_000),
            script: script.clone(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![Txid::from_byte_array([9; 32])],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
            depth: 0,
        };
        let deprecated_pk = PublicKey::from_str(
            "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
        )
        .expect("valid key")
        .x_only_public_key()
        .0;
        let snapshot = snapshot_from_virtual_tx_outpoints_with_script_lookup(
            330,
            1_000_000,
            vec![vtxo],
            |lookup_script| {
                if lookup_script == &script {
                    Some(deprecated_pk)
                } else {
                    None
                }
            },
        );
        let info = server_info(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            vec![(
                "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                500_000,
            )],
        );
        let buckets = offchain_balance_buckets_from_snapshot(
            &snapshot,
            &info,
            1_000_000,
            None,
            &BTreeMap::new(),
        )
        .expect("snapshot buckets");
        let balance =
            balance_from_persisted_snapshot(buckets, &empty_recoverable(), 0, 0, 0, 0, Vec::new());
        let payments = persisted_payments_from_snapshot(&snapshot).expect("snapshot history");

        assert_eq!(balance.boarding_spendable_sats, 0);
        assert_eq!(balance.boarding_pending_sats, 0);
        assert_eq!(balance.pending_recovery_due_to_expired_signer_sats, 50_000);
        assert!(balance.total_sats >= 50_000);
        assert!(payments.is_empty() || payments.iter().all(|row| row.amount_sats > 0));
    }
}
