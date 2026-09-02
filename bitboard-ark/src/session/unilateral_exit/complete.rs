use crate::api_types::{
    CompleteUnilateralExitParams, MissingBlocktimeCompletionInputDto, OnchainBumperInfoDto,
    UnilateralExitCompletionFeeEstimateDto, UnilateralExitCompletionFeeEstimateParams,
};
use crate::constants::MIN_FEE_RATE_SAT_PER_VB;
use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::OnchainOutPoint;
use crate::persistence::{JsonPersistenceDb, OffchainVtxoSnapshot};

use super::snapshot_ops::{
    autonomous_build_unilateral_branch_for_leaf_tx, autonomous_complete_unilateral_exit,
    autonomous_estimate_unilateral_exit_completion, dedup_virtual_outpoints,
};
use crate::session::ArkSession;
use crate::session::mappers::parse_onchain_address;
use crate::session::open::sync_onchain_wallet_with_retries;

fn set_leaf_virtual_tx_vtxos_unrolled_flag_in_snapshot(
    snapshot: &mut OffchainVtxoSnapshot,
    txid: &str,
    is_unrolled: bool,
) {
    for record in &mut snapshot.virtual_tx_outpoints {
        if record.txid == txid {
            record.is_unrolled = is_unrolled;
        }
    }
}

fn set_leaf_virtual_tx_vtxos_unrolled_flag_in_wallet_db(
    wallet_db: &JsonPersistenceDb,
    txid: &str,
    is_unrolled: bool,
) {
    let Some(mut snapshot) = wallet_db.snapshot().offchain_vtxo_snapshot.clone() else {
        return;
    };
    set_leaf_virtual_tx_vtxos_unrolled_flag_in_snapshot(&mut snapshot, txid, is_unrolled);
    wallet_db.set_offchain_vtxo_snapshot(snapshot);
}

fn resolve_completion_fee_rate_sat_per_vb(override_rate_sat_per_vb: Option<f64>) -> f64 {
    override_rate_sat_per_vb
        .unwrap_or(MIN_FEE_RATE_SAT_PER_VB)
        .max(MIN_FEE_RATE_SAT_PER_VB)
}

fn map_missing_blocktime_completion_inputs(
    inputs: &[ark_client::MissingBlocktimeCompletionInput],
) -> Vec<MissingBlocktimeCompletionInputDto> {
    inputs
        .iter()
        .map(|input| {
            let on_chain_outpoint = OnchainOutPoint::from_bitcoin_outpoint(input.on_chain_outpoint);
            MissingBlocktimeCompletionInputDto {
                virtual_txid: input.virtual_txid.to_string(),
                on_chain_txid: on_chain_outpoint.txid().to_string(),
                on_chain_vout: on_chain_outpoint.vout(),
                amount_sats: input.amount_sats,
            }
        })
        .collect()
}

impl ArkSession {
    pub async fn onchain_bumper_info(&self) -> ArkResult<OnchainBumperInfoDto> {
        // The on-chain (bumper) wallet is only synced once at session open, so without a refresh
        // here the unilateral-exit dialog would report a stale session-open balance and ignore any
        // funds the user added afterwards. Re-sync before reading so both the displayed balance and
        // the `bumper_sufficient` gate (which goes through this) reflect current on-chain funds.
        sync_onchain_wallet_with_retries(&self.client).await?;
        let address = self.client.onchain_wallet_address()?;
        let balance = self.client.onchain_wallet_balance()?;
        let server_info = self.client.server_info()?;
        let (unilateral_exit_timelock_blocks, unilateral_exit_timelock_seconds) =
            crate::session::mappers::unilateral_exit_timelock_parts(
                server_info.unilateral_exit_delay,
            );
        Ok(OnchainBumperInfoDto {
            address: address.to_string(),
            balance_sats: balance.confirmed.to_sat(),
            unilateral_exit_timelock_blocks,
            unilateral_exit_timelock_seconds,
        })
    }

    pub(crate) fn mark_leaf_virtual_tx_vtxos_unrolled_in_snapshot(
        &self,
        txid: &str,
    ) -> ArkResult<()> {
        set_leaf_virtual_tx_vtxos_unrolled_flag_in_wallet_db(&self.wallet_db, txid, true);
        Ok(())
    }

    pub async fn complete_unilateral_exit(
        &self,
        params: CompleteUnilateralExitParams,
    ) -> ArkResult<String> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let deduped_vtxo_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);

        let in_progress = self.unilateral_exit_in_progress_outpoints()?;
        for outpoint in &deduped_vtxo_outpoints {
            let parsed_outpoint = outpoint.to_bitcoin_outpoint();
            if !in_progress.contains(&parsed_outpoint) {
                return Err(ArkWasmError::VtxoNotInUnilateralExit {
                    txid: outpoint.txid.to_string(),
                    vout: outpoint.vout,
                });
            }
        }

        let destination = parse_onchain_address(&params.destination_address, self.network())?;
        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);
        autonomous_complete_unilateral_exit(
            self,
            &deduped_vtxo_outpoints,
            destination,
            fee_rate_sat_per_vb,
        )
        .await
    }

    pub async fn estimate_unilateral_exit_completion(
        &self,
        params: UnilateralExitCompletionFeeEstimateParams,
    ) -> ArkResult<UnilateralExitCompletionFeeEstimateDto> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let destination = match parse_onchain_address(&params.destination_address, self.network()) {
            Ok(address) => address,
            Err(error) => {
                return Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: 0,
                    estimated_fee_sats: 0,
                    estimated_receive_sats: 0,
                    fee_rate_sat_per_vb: MIN_FEE_RATE_SAT_PER_VB,
                    estimate_error: Some(error.to_string()),
                    missing_blocktime_inputs: Vec::new(),
                });
            }
        };

        let deduped_vtxo_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);
        let fee_rate_sat_per_vb =
            resolve_completion_fee_rate_sat_per_vb(params.fee_rate_sat_per_vb);

        match autonomous_estimate_unilateral_exit_completion(
            self,
            &deduped_vtxo_outpoints,
            destination,
            fee_rate_sat_per_vb,
        )
        .await
        {
            Ok((fee, to_amount, selected_amount, missing_blocktime_inputs)) => {
                Ok(UnilateralExitCompletionFeeEstimateDto {
                    selected_total_sats: selected_amount.to_sat(),
                    estimated_fee_sats: fee.to_sat(),
                    estimated_receive_sats: to_amount.to_sat(),
                    fee_rate_sat_per_vb,
                    estimate_error: None,
                    missing_blocktime_inputs: map_missing_blocktime_completion_inputs(
                        &missing_blocktime_inputs,
                    ),
                })
            }
            Err(error) => Ok(UnilateralExitCompletionFeeEstimateDto {
                selected_total_sats: 0,
                estimated_fee_sats: 0,
                estimated_receive_sats: 0,
                fee_rate_sat_per_vb,
                estimate_error: Some(error.to_string()),
                missing_blocktime_inputs: Vec::new(),
            }),
        }
    }

    pub(crate) async fn build_unilateral_branch_for_leaf_tx(
        &self,
        leaf_txid: bitcoin::Txid,
    ) -> ArkResult<Vec<bitcoin::Transaction>> {
        autonomous_build_unilateral_branch_for_leaf_tx(self, leaf_txid).await
    }
}

#[cfg(test)]
mod completion_helper_tests {
    use super::{map_missing_blocktime_completion_inputs, resolve_completion_fee_rate_sat_per_vb};
    use ark_client::MissingBlocktimeCompletionInput;
    use bitcoin::hashes::Hash;
    use bitcoin::{OutPoint, Txid};

    #[test]
    fn completion_fee_rate_prefers_override_and_enforces_minimum() {
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(Some(5.0)), 5.0);
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(Some(0.05)), 0.1);
        assert_eq!(resolve_completion_fee_rate_sat_per_vb(None), 0.1);
    }

    #[test]
    fn map_missing_blocktime_completion_inputs_maps_virtual_and_on_chain_fields() {
        let virtual_txid = Txid::from_byte_array([0xab; 32]);
        let on_chain_txid = Txid::from_byte_array([0xcd; 32]);
        let mapped = map_missing_blocktime_completion_inputs(&[MissingBlocktimeCompletionInput {
            virtual_txid,
            on_chain_outpoint: OutPoint {
                txid: on_chain_txid,
                vout: 2,
            },
            amount_sats: 150_000,
        }]);
        assert_eq!(mapped.len(), 1);
        assert_eq!(mapped[0].virtual_txid, virtual_txid.to_string());
        assert_eq!(mapped[0].on_chain_txid, on_chain_txid.to_string());
        assert_eq!(mapped[0].on_chain_vout, 2);
        assert_eq!(mapped[0].amount_sats, 150_000);
    }
}

#[cfg(test)]
mod leaf_virtual_tx_co_mark_tests {
    use super::set_leaf_virtual_tx_vtxos_unrolled_flag_in_wallet_db;
    use crate::persistence::{JsonPersistenceDb, OffchainVtxoSnapshot, VirtualTxOutPointRecord};
    use bitcoin::Txid;
    use bitcoin::hashes::Hash;

    fn sibling_snapshot(txid_byte: u8) -> OffchainVtxoSnapshot {
        let txid = Txid::from_byte_array([txid_byte; 32]).to_string();
        OffchainVtxoSnapshot {
            synced_at: 1,
            dust_sats: 330,
            virtual_tx_outpoints: vec![
                VirtualTxOutPointRecord {
                    txid: txid.clone(),
                    vout: 0,
                    created_at: 0,
                    expires_at: 9_999_999_999,
                    amount_sats: 50_000,
                    script_hex: String::new(),
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                    spent_by: None,
                    commitment_txids: vec![],
                    settled_by: None,
                    ark_txid: None,
                    assets: vec![],
                    server_pk_hex: None,
                },
                VirtualTxOutPointRecord {
                    txid,
                    vout: 1,
                    created_at: 0,
                    expires_at: 9_999_999_999,
                    amount_sats: 25_000,
                    script_hex: String::new(),
                    is_preconfirmed: false,
                    is_swept: false,
                    is_unrolled: false,
                    is_spent: false,
                    spent_by: None,
                    commitment_txids: vec![],
                    settled_by: None,
                    ark_txid: None,
                    assets: vec![],
                    server_pk_hex: None,
                },
            ],
            unilateral_exit_materials_by_leaf_tx: std::collections::BTreeMap::new(),
        }
    }

    #[test]
    fn mark_leaf_virtual_tx_co_marks_all_vouts_on_tx() {
        let wallet_db = JsonPersistenceDb::default();
        let txid = Txid::from_byte_array([0x88; 32]).to_string();
        wallet_db.set_offchain_vtxo_snapshot(sibling_snapshot(0x88));

        set_leaf_virtual_tx_vtxos_unrolled_flag_in_wallet_db(&wallet_db, &txid, true);

        let snapshot = wallet_db
            .snapshot()
            .offchain_vtxo_snapshot
            .expect("snapshot after co-mark");
        assert!(
            snapshot
                .virtual_tx_outpoints
                .iter()
                .all(|record| record.is_unrolled)
        );
    }
}
