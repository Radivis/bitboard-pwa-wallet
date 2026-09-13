use ark_core::ArkAddress;
use ark_core::VtxoList;
use ark_core::coin_select::{VirtualTxOutPoint as CoinSelectVtxo, select_vtxos};
use ark_core::send::SendReceiver;
use bitcoin::{Amount, OutPoint, ScriptBuf, XOnlyPublicKey};

use crate::api_types::{DelegateInfoDto, PaymentRowDto, SendPaymentParams};
use crate::error::{ArkResult, ArkWasmError};
use crate::offchain_snapshot::{
    offchain_history_from_snapshot, script_to_server_pk_lookup, vtxo_list_from_snapshot,
};
use crate::session::pending_exit::mark_vtxo_spent_in_wallet_db;

use super::ArkSession;
use super::mappers::{current_unix_timestamp, map_history_row, validate_send_amount_sats};
use super::offchain_balance::legacy_signer_pk_fallback;

impl ArkSession {
    fn select_send_outpoints_from_vtxo_list(
        &self,
        vtxo_list: &VtxoList,
        amount: Amount,
        server_pk_for_script: impl Fn(&ScriptBuf) -> Option<XOnlyPublicKey>,
    ) -> ArkResult<Vec<OutPoint>> {
        let now = current_unix_timestamp();
        let server_info = self.client.server_info()?;
        let exclude = self.spend_locked_outpoints();
        let spendable: Vec<CoinSelectVtxo> = vtxo_list
            .spendable_offchain_at(&server_info, now, server_pk_for_script)
            .filter(|vtxo| !exclude.contains(&vtxo.outpoint))
            .map(|vtxo| CoinSelectVtxo {
                outpoint: vtxo.outpoint,
                script_pubkey: vtxo.script.clone(),
                expire_at: vtxo.expires_at,
                amount: vtxo.amount,
                assets: vtxo.assets.clone(),
            })
            .collect();
        let selected = select_vtxos(spendable, amount, server_info.dust, true)?;
        Ok(selected.into_iter().map(|vtxo| vtxo.outpoint).collect())
    }

    fn try_send_outpoints_from_snapshot(&self, amount: Amount) -> Option<Vec<OutPoint>> {
        let snapshot = self.wallet_db.snapshot().offchain_vtxo_snapshot?;
        let vtxo_list = vtxo_list_from_snapshot(&snapshot).ok()?;
        let script_lookup = script_to_server_pk_lookup(
            &snapshot,
            legacy_signer_pk_fallback(&self.persisted_operator_identity()),
        )
        .ok()?;
        self.select_send_outpoints_from_vtxo_list(&vtxo_list, amount, |script| {
            script_lookup(script)
        })
        .ok()
    }

    async fn send_outpoints_excluding_spend_locked(
        &self,
        amount: Amount,
    ) -> ArkResult<Vec<OutPoint>> {
        if let Some(selected) = self.try_send_outpoints_from_snapshot(amount) {
            return Ok(selected);
        }
        let (vtxo_list, script_map) = self.client.list_spendable_vtxos().await?;
        self.select_send_outpoints_from_vtxo_list(&vtxo_list, amount, |script| {
            script_map.get(script).map(|vtxo| vtxo.server_pk())
        })
    }

    pub async fn send_payment(&self, params: SendPaymentParams) -> ArkResult<String> {
        self.ensure_operator_rpc_allowed()?;
        validate_send_amount_sats(params.amount_sats)?;
        let address = ArkAddress::decode(&params.address)?;
        let amount = Amount::from_sat(params.amount_sats);
        let selected = self.send_outpoints_excluding_spend_locked(amount).await?;
        let txid = self
            .client
            .send_selection(&selected, vec![SendReceiver::bitcoin(address, amount)])
            .await?;
        for outpoint in &selected {
            mark_vtxo_spent_in_wallet_db(
                &self.wallet_db,
                &outpoint.txid.to_string(),
                outpoint.vout,
                &txid.to_string(),
            );
        }
        Ok(txid.to_string())
    }

    pub async fn transaction_history(&self) -> ArkResult<Vec<PaymentRowDto>> {
        let boarding_commitment_transactions = self.boarding_commitment_txids().await?;
        let mut transactions = self.boarding_history_transactions().await?;

        if let Some(snapshot) = self.wallet_db.snapshot().offchain_vtxo_snapshot.clone() {
            let mut offchain =
                offchain_history_from_snapshot(&snapshot, &boarding_commitment_transactions)?;
            transactions.append(&mut offchain);
        }

        ark_core::history::sort_transactions_by_created_at(&mut transactions);
        let rows = transactions
            .into_iter()
            .filter_map(map_history_row)
            .collect();
        Ok(rows)
    }

    pub async fn delegate_info(&self) -> ArkResult<DelegateInfoDto> {
        let delegator = self
            .delegator
            .as_ref()
            .ok_or(ArkWasmError::DelegatorNotConfigured)?;
        let info = delegator.info().await?;
        let fee = info
            .fee
            .parse::<u64>()
            .map_err(|error| ArkWasmError::InvalidDelegatorFee(error.to_string()))?;
        Ok(DelegateInfoDto {
            pubkey: info.pubkey,
            fee,
            delegator_address: info.delegator_address,
        })
    }
}
