use bitcoin::{Amount, OutPoint, secp256k1::rand::rngs::OsRng};

use crate::api_types::{
    DelegateSpendableResult, FinalizePendingResult, RecoverableVtxoFeeEstimateDto,
    VtxoExpiryStatusDto,
};
use crate::constants::VTXO_SELF_RENEW_REMAINING_FRACTION;
use crate::error::{ArkResult, ArkWasmError};
use crate::offchain_snapshot::vtxo_list_from_snapshot;

use super::ArkSession;
use super::mappers::{
    current_unix_timestamp, empty_fee_info, map_intent_fee_configured, parse_delegator_public_key,
};

/// Recoverable VTXO outpoints and aggregate amount (expired / swept / sub-dust).
pub(crate) struct RecoverableVtxoSummary {
    pub outpoints: Vec<OutPoint>,
    pub total_sats: u64,
    pub count: u32,
}

impl ArkSession {
    pub(crate) async fn recoverable_vtxo_summary(&self) -> ArkResult<RecoverableVtxoSummary> {
        if let Ok((vtxo_list, _)) = self.client.list_vtxos().await {
            return Ok(recoverable_vtxo_summary_from_list(&vtxo_list));
        }

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.as_ref() {
            let vtxo_list = vtxo_list_from_snapshot(snapshot)?;
            return Ok(recoverable_vtxo_summary_from_list(&vtxo_list));
        }

        Ok(RecoverableVtxoSummary {
            outpoints: Vec::new(),
            total_sats: 0,
            count: 0,
        })
    }

    pub async fn recoverable_vtxo_fee_estimate(&self) -> ArkResult<RecoverableVtxoFeeEstimateDto> {
        let fees = self
            .client
            .server_info()?
            .fees
            .clone()
            .unwrap_or_else(empty_fee_info);
        let intent_fee_configured = map_intent_fee_configured(&fees.intent_fee);
        let summary = self.recoverable_vtxo_summary().await?;

        if summary.count == 0 {
            return Ok(RecoverableVtxoFeeEstimateDto {
                recoverable_vtxo_count: 0,
                recoverable_total_sats: 0,
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: None,
                estimated_receive_sats: None,
                estimate_error: None,
            });
        }

        let (to_address, _) = self.client.get_offchain_address()?;
        let mut rng = OsRng;
        match self
            .client
            .estimate_batch_fees_vtxo_selection(
                &mut rng,
                summary.outpoints.iter().copied(),
                to_address,
            )
            .await
        {
            Ok(estimate) => {
                let fee_sats = estimate.abs().to_sat() as u64;
                let receive = summary.total_sats.saturating_sub(fee_sats);
                Ok(RecoverableVtxoFeeEstimateDto {
                    recoverable_vtxo_count: summary.count,
                    recoverable_total_sats: summary.total_sats,
                    tx_fee_rate: fees.tx_fee_rate,
                    intent_fee_configured,
                    estimated_total_fee_sats: Some(fee_sats),
                    estimated_receive_sats: Some(receive),
                    estimate_error: None,
                })
            }
            Err(error) => Ok(RecoverableVtxoFeeEstimateDto {
                recoverable_vtxo_count: summary.count,
                recoverable_total_sats: summary.total_sats,
                tx_fee_rate: fees.tx_fee_rate,
                intent_fee_configured,
                estimated_total_fee_sats: None,
                estimated_receive_sats: None,
                estimate_error: Some(error.to_string()),
            }),
        }
    }

    pub async fn recover_recoverable_vtxos(&self) -> ArkResult<Option<String>> {
        let summary = self.recoverable_vtxo_summary().await?;
        if summary.outpoints.is_empty() {
            return Ok(None);
        }
        let mut rng = OsRng;
        let txid = self
            .client
            .settle_vtxos(&mut rng, &summary.outpoints, &[])
            .await?;
        if txid.is_some() {
            self.sync_with_operator().await?;
        }
        Ok(txid.map(|id| id.to_string()))
    }

    pub async fn expiring_vtxo_count(&self) -> ArkResult<u32> {
        Ok(self.expiring_outpoints().await?.len() as u32)
    }

    pub async fn vtxo_expiry_status(&self) -> ArkResult<VtxoExpiryStatusDto> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let now = current_unix_timestamp();
        let earliest_expires_at = vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                virtual_tx_outpoint.created_at > 0 && virtual_tx_outpoint.expires_at > now
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.expires_at)
            .min();
        let expiring_soon_count = self.expiring_vtxo_count().await?;
        Ok(VtxoExpiryStatusDto {
            earliest_expires_at,
            expiring_soon_count,
        })
    }

    pub async fn renew_vtxos_now(&self) -> ArkResult<Option<String>> {
        let expiring = self.expiring_outpoints().await?;
        if expiring.is_empty() {
            return Ok(None);
        }
        let mut rng = OsRng;
        let txid = self.client.settle_vtxos(&mut rng, &expiring, &[]).await?;
        Ok(txid.map(|id| id.to_string()))
    }

    pub async fn delegate_spendable_vtxos(&self) -> ArkResult<DelegateSpendableResult> {
        let Some(delegator) = self.delegator.as_ref() else {
            return Ok(DelegateSpendableResult {
                delegated: 0,
                failed: 0,
                error_message: None,
            });
        };

        let delegator_info = delegator.info().await?;
        let delegator_pubkey = parse_delegator_public_key(&delegator_info.pubkey)?;
        let mut delegated = 0u32;
        let mut failed = 0u32;
        let mut error_message = None;

        let cosigner_pk = delegator_pubkey.inner;
        match self.client.generate_delegate(cosigner_pk).await {
            Ok(mut delegate) => {
                if let Err(error) = self
                    .client
                    .sign_delegate_psbts(&mut delegate.intent.proof, &mut delegate.forfeit_psbts)
                {
                    failed = 1;
                    error_message = Some(format!("sign delegate PSBTs: {error}"));
                } else if let Err(error) = delegator
                    .delegate(&delegate.intent, &delegate.forfeit_psbts, None)
                    .await
                {
                    failed = 1;
                    error_message = Some(format!("delegator RPC: {error}"));
                } else {
                    delegated = delegate.forfeit_psbts.len() as u32;
                }
            }
            Err(error) => {
                failed = 1;
                error_message = Some(format!("generate delegate: {error}"));
            }
        }

        Ok(DelegateSpendableResult {
            delegated,
            failed,
            error_message,
        })
    }

    pub async fn finalize_pending_transactions(&self) -> ArkResult<FinalizePendingResult> {
        let pending_before = self.client.list_pending_offchain_txs().await?.len();
        let finalized = self.client.continue_pending_offchain_txs().await?;
        let pending_after = self.client.list_pending_offchain_txs().await?.len();
        Ok(FinalizePendingResult {
            finalized: finalized.len() as u32,
            pending: pending_after.max(pending_before.saturating_sub(finalized.len())) as u32,
        })
    }

    pub async fn onboard_boarded_utxos(&self) -> ArkResult<Option<String>> {
        let status = self.boarding_status().await?;
        if status.spendable_sats == 0 {
            if status.pending_sats > 0 {
                return Err(ArkWasmError::Boarding(
                    "Boarding payment is unconfirmed. Wait for at least one block confirmation, then try again.".to_string(),
                ));
            }
            if status.expired_sats > 0 {
                return Err(ArkWasmError::Boarding(
                    "Boarding UTXO can only be spent unilaterally now. Use the unilateral exit flow instead of settle.".to_string(),
                ));
            }
            if status.tracked_addresses.is_empty() {
                return Err(ArkWasmError::Boarding(
                    "No boarding address is registered for this wallet session.".to_string(),
                ));
            }
            return Err(ArkWasmError::Boarding(format!(
                "No spendable boarding UTXO found at {}. Confirm the payment was sent to that exact address on {}.",
                status.boarding_address,
                self.network_mode.label(),
            )));
        }

        let mut rng = OsRng;
        let boarding_outpoint = self
            .newest_cooperative_boarding_outpoint()
            .await?
            .ok_or_else(|| {
                ArkWasmError::Boarding(
                    "No boarding UTXO is inside the operator cooperative settle window. \
                     Fund the boarding address and settle within ~30 seconds of confirmation."
                        .to_string(),
                )
            })?;

        match self
            .client
            .settle_vtxos(&mut rng, &[], &[boarding_outpoint])
            .await
        {
            Ok(Some(txid)) => Ok(Some(txid.to_string())),
            Ok(None) => Err(ArkWasmError::Boarding(
                "Settle returned no inputs even though boarding UTXOs looked spendable. Try again in a moment.".to_string(),
            )),
            Err(error) => Err(error.into()),
        }
    }
    async fn expiring_outpoints(&self) -> ArkResult<Vec<OutPoint>> {
        let (vtxo_list, _) = self.client.list_vtxos().await?;
        let now = current_unix_timestamp();
        Ok(vtxo_list
            .all_unspent()
            .filter(|virtual_tx_outpoint| {
                if virtual_tx_outpoint.expires_at <= 0 || virtual_tx_outpoint.created_at <= 0 {
                    return false;
                }
                let total_lifetime =
                    virtual_tx_outpoint.expires_at - virtual_tx_outpoint.created_at;
                let remaining = virtual_tx_outpoint.expires_at - now;
                remaining > 0
                    && (remaining as f64)
                        < (total_lifetime as f64 * VTXO_SELF_RENEW_REMAINING_FRACTION)
            })
            .map(|virtual_tx_outpoint| virtual_tx_outpoint.outpoint)
            .collect())
    }
}

pub(crate) fn recoverable_vtxo_summary_from_list(
    vtxo_list: &ark_core::VtxoList,
) -> RecoverableVtxoSummary {
    let recoverable: Vec<_> = vtxo_list.recoverable().collect();
    let total_sats = recoverable
        .iter()
        .fold(Amount::ZERO, |acc, vtxo| acc + vtxo.amount)
        .to_sat();
    let outpoints: Vec<OutPoint> = recoverable.into_iter().map(|vtxo| vtxo.outpoint).collect();
    RecoverableVtxoSummary {
        count: outpoints.len() as u32,
        total_sats,
        outpoints,
    }
}

#[cfg(test)]
mod recoverable_vtxo_tests {
    use ark_core::server::VirtualTxOutPoint;
    use bitcoin::hashes::Hash;
    use bitcoin::{Amount, OutPoint, ScriptBuf, Txid};

    use super::recoverable_vtxo_summary_from_list;
    use crate::session::mappers::current_unix_timestamp;

    fn sample_vtp(amount_sats: u64, expires_at: i64) -> VirtualTxOutPoint {
        VirtualTxOutPoint {
            outpoint: OutPoint::new(Txid::all_zeros(), amount_sats as u32 % 10),
            created_at: expires_at - 86_400,
            expires_at,
            amount: Amount::from_sat(amount_sats),
            script: ScriptBuf::new(),
            is_preconfirmed: false,
            is_swept: false,
            is_unrolled: false,
            is_spent: false,
            spent_by: None,
            commitment_txids: vec![],
            settled_by: None,
            ark_txid: None,
            assets: vec![],
        }
    }

    #[test]
    fn recoverable_vtxo_summary_counts_expired_vtxos() {
        let now = current_unix_timestamp();
        let dust = Amount::from_sat(330);
        let vtxo_list = ark_core::VtxoList::new(
            dust,
            vec![
                sample_vtp(25_000, now - 1),
                sample_vtp(25_000, now - 1),
                sample_vtp(10_000, now + 86_400),
            ],
        );
        let summary = recoverable_vtxo_summary_from_list(&vtxo_list);
        assert_eq!(summary.count, 2);
        assert_eq!(summary.total_sats, 50_000);
        assert_eq!(summary.outpoints.len(), 2);
    }

    #[test]
    fn recoverable_vtxo_summary_empty_when_none_recoverable() {
        let now = current_unix_timestamp();
        let dust = Amount::from_sat(330);
        let vtxo_list = ark_core::VtxoList::new(dust, vec![sample_vtp(10_000, now + 86_400)]);
        let summary = recoverable_vtxo_summary_from_list(&vtxo_list);
        assert_eq!(summary.count, 0);
        assert_eq!(summary.total_sats, 0);
    }
}
