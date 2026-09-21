use crate::api_types::{
    CompleteUnilateralExitParams, MissingBlocktimeCompletionInputDto, OnchainBumperInfoDto,
    UnilateralExitCompletionFeeEstimateDto, UnilateralExitCompletionFeeEstimateParams,
};
use crate::constants::MIN_FEE_RATE_SAT_PER_VB;
use crate::error::{ArkResult, ArkWasmError};
use crate::outpoint::OnchainOutPoint;

use super::snapshot_ops::{
    autonomous_build_unilateral_branch_for_leaf_tx, autonomous_complete_unilateral_exit,
    autonomous_estimate_unilateral_exit_completion, dedup_virtual_outpoints,
};
use crate::session::ArkSession;
use crate::session::bumper_sync_policy::{
    BumperWalletSyncPhase, bumper_confirmed_balance_sats, bumper_info_should_full_sync_wallet,
    tip_address_confirmed_sats,
};
use crate::session::mappers::parse_onchain_address;
use crate::session::open::sync_onchain_wallet_with_retries;
use ark_client::Blockchain;

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
    async fn ensure_bumper_wallet_synced_once(&self) -> ArkResult<()> {
        if !bumper_info_should_full_sync_wallet(self.onchain_wallet_sync_phase.get()) {
            return Ok(());
        }
        self.onchain_wallet_sync_phase
            .set(BumperWalletSyncPhase::Running);
        let sync_result = sync_onchain_wallet_with_retries(&self.client).await;
        self.onchain_wallet_sync_phase
            .set(BumperWalletSyncPhase::Done);
        sync_result
    }

    pub async fn onchain_bumper_info(&self) -> ArkResult<OnchainBumperInfoDto> {
        // LIFE-ARK-BUMP-01: one wallet-wide Esplora scan per session. Later polls probe
        // the displayed unused address via /utxo so a 4s underfunded refetch cannot
        // restart a scripthash /txs HD walk.
        self.ensure_bumper_wallet_synced_once().await?;
        let address = self.client.onchain_wallet_address()?;
        let wallet_confirmed_sats = self.client.onchain_wallet_balance()?.confirmed.to_sat();
        let tip_utxos = self.client.blockchain().find_outpoints(&address).await?;
        let balance_sats = bumper_confirmed_balance_sats(
            wallet_confirmed_sats,
            tip_address_confirmed_sats(&tip_utxos),
        );
        let server_info = self.client.server_info()?;
        let (unilateral_exit_timelock_blocks, unilateral_exit_timelock_seconds) =
            crate::session::mappers::unilateral_exit_timelock_parts(
                server_info.unilateral_exit_delay,
            );
        Ok(OnchainBumperInfoDto {
            address: address.to_string(),
            balance_sats,
            unilateral_exit_timelock_blocks,
            unilateral_exit_timelock_seconds,
        })
    }

    pub async fn complete_unilateral_exit(
        &self,
        params: CompleteUnilateralExitParams,
    ) -> ArkResult<String> {
        if params.vtxo_outpoints.is_empty() {
            return Err(ArkWasmError::EmptyVtxoOutpoints);
        }

        let deduped_vtxo_outpoints = dedup_virtual_outpoints(params.vtxo_outpoints);

        self.reconcile_host_tx_finality().await?;

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
