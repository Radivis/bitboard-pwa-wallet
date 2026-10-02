//! Collaborative exit at the server's offboard fee rate.
//!
//! `prepare_offboard` rejects a rate below the server's current slow target.
//! `Wallet::send_onchain` and `Wallet::offboard_all` commit
//! `ServerConnection::offboard_feerate`, and `run_offboard` persists the
//! checkpoint and holds the action lock before the drive.

use std::collections::HashSet;

use wasm_bindgen::prelude::*;

use crate::board::BarkBoardFeeEstimate;
use crate::exit_address::{
    ExitInputState, classify_offboard_failure, parse_receive_address,
    spent_vtxo_ids_named_by_server,
};
use crate::session::{
    bark_error, finish_wallet_operation, require_session_synced, session_bitcoin_network,
    take_active_wallet,
};

fn exit_destination(address: &str) -> Result<bitcoin::Address, JsValue> {
    require_session_synced().map_err(|err| JsValue::from_str(&err))?;
    let network = session_bitcoin_network().map_err(|err| JsValue::from_str(&err))?;
    parse_receive_address(address, network).map_err(|err| JsValue::from_str(&err))
}

fn require_exit_amount(amount_sats: u64) -> Result<(), JsValue> {
    if amount_sats == 0 {
        Err(JsValue::from_str("Bark exit amount is invalid"))
    } else {
        Ok(())
    }
}

fn fee_estimate_from_bark(estimate: bark::FeeEstimate) -> BarkBoardFeeEstimate {
    BarkBoardFeeEstimate::from_parts(
        estimate.gross_amount.to_sat(),
        estimate.fee.to_sat(),
        estimate.net_amount.to_sat(),
    )
}

async fn pending_offboard_ids(wallet: &bark::Wallet) -> Result<HashSet<String>, String> {
    let pending = wallet.pending_offboards().await.map_err(bark_error)?;
    Ok(pending.into_iter().map(|offboard| offboard.id()).collect())
}

async fn offboard_txid_or_parked<E: std::fmt::Display>(
    wallet: &bark::Wallet,
    ids_before: HashSet<String>,
    result: Result<bitcoin::Txid, E>,
) -> Result<String, String> {
    match result {
        Ok(txid) => Ok(txid.to_string()),
        Err(err) => {
            let message = bark_error(&err);
            if let Err(retire_error) =
                retire_offboard_if_server_spent_an_input(wallet, &message).await
            {
                return Err(format!("{message} ({retire_error})"));
            }
            let ids_after = pending_offboard_ids(wallet).await.unwrap_or_default();
            Err(classify_offboard_failure(&ids_before, &ids_after, &message))
        }
    }
}

/// Server offboard fee for paying `amount_sats` on-chain. `net_amount_sats` is what arrives.
#[wasm_bindgen]
pub async fn bark_estimate_send_onchain(
    address: String,
    amount_sats: u64,
) -> Result<BarkBoardFeeEstimate, JsValue> {
    require_exit_amount(amount_sats)?;
    let destination = exit_destination(&address)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = wallet
            .estimate_send_onchain(&destination, bitcoin::Amount::from_sat(amount_sats))
            .await
            .map_err(bark_error)?;
        Ok(fee_estimate_from_bark(estimate))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Pays `amount_sats` on-chain at the server's offboard fee rate.
/// Returns the offboard txid once broadcast.
/// A park before broadcast is `bark_offboard_parked` when this attempt created a checkpoint.
#[wasm_bindgen]
pub async fn bark_send_onchain(address: String, amount_sats: u64) -> Result<String, JsValue> {
    require_exit_amount(amount_sats)?;
    let destination = exit_destination(&address)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let ids_before = pending_offboard_ids(&wallet).await?;
        let result = wallet
            .send_onchain(destination, bitcoin::Amount::from_sat(amount_sats))
            .await;
        offboard_txid_or_parked(&wallet, ids_before, result).await
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Server offboard fee for every spendable VTXO. `net_amount_sats` is what arrives.
#[wasm_bindgen]
pub async fn bark_estimate_offboard_all(address: String) -> Result<BarkBoardFeeEstimate, JsValue> {
    let destination = exit_destination(&address)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = wallet
            .estimate_offboard_all(&destination)
            .await
            .map_err(bark_error)?;
        Ok(fee_estimate_from_bark(estimate))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Offboards every spendable VTXO at the server's offboard fee rate.
/// Returns the offboard txid once broadcast.
#[wasm_bindgen]
pub async fn bark_offboard_all(address: String) -> Result<String, JsValue> {
    let destination = exit_destination(&address)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let ids_before = pending_offboard_ids(&wallet).await?;
        let result = wallet.offboard_all(destination).await;
        offboard_txid_or_parked(&wallet, ids_before, result).await
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

fn exit_input_is_already_consumed(vtxo: &bark::WalletVtxo) -> bool {
    matches!(
        exit_input_state(vtxo),
        ExitInputState::Spent | ExitInputState::Exited
    )
}

fn exit_input_state(vtxo: &bark::WalletVtxo) -> ExitInputState {
    match vtxo.state.kind() {
        bark::vtxo::VtxoStateKind::Spendable => ExitInputState::Spendable,
        bark::vtxo::VtxoStateKind::Locked => ExitInputState::Locked,
        bark::vtxo::VtxoStateKind::Spent => ExitInputState::Spent,
        bark::vtxo::VtxoStateKind::Exited => ExitInputState::Exited,
    }
}

fn offboard_input_ids(offboard: &bark::actions::offboard::Offboard) -> Vec<String> {
    let ids = match &offboard.kind {
        bark::actions::offboard::OffboardKind::OffboardWhole { input_vtxo_ids }
        | bark::actions::offboard::OffboardKind::SendOnchain { input_vtxo_ids, .. } => {
            input_vtxo_ids
        }
    };
    ids.iter().map(ToString::to_string).collect()
}

/// The server already spent this input. Record that locally and drop the checkpoint
/// so the next exit's spendable selection cannot submit it again.
pub(crate) async fn retire_offboard_if_server_spent_an_input(
    wallet: &bark::Wallet,
    error_message: &str,
) -> Result<bool, String> {
    let spent_ids = spent_vtxo_ids_named_by_server(error_message);
    if spent_ids.is_empty() {
        return Ok(false);
    }
    record_named_vtxos_as_spent(wallet, &spent_ids).await?;
    stop_offboards_that_name(wallet, &spent_ids).await?;
    Ok(true)
}

/// A checkpoint whose input is already spent or exited must not be driven again.
pub(crate) async fn stop_offboard_whose_inputs_are_already_consumed(
    wallet: &bark::Wallet,
    offboard: &bark::actions::offboard::Offboard,
) -> Result<bool, String> {
    let input_ids = offboard_input_ids(offboard);
    let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
    let consumed = input_ids.iter().any(|input_id| {
        vtxos
            .iter()
            .any(|vtxo| vtxo.id().to_string() == *input_id && exit_input_is_already_consumed(vtxo))
    });
    if !consumed {
        return Ok(false);
    }
    wallet
        .stop_wallet_action(&offboard.id)
        .await
        .map_err(bark_error)?;
    Ok(true)
}

async fn record_named_vtxos_as_spent(
    wallet: &bark::Wallet,
    spent_ids: &[String],
) -> Result<(), String> {
    let vtxos = wallet.all_vtxos().await.map_err(bark_error)?;
    let matched = vtxos
        .into_iter()
        .filter(|vtxo| {
            spent_ids
                .iter()
                .any(|spent_id| spent_id == &vtxo.id().to_string())
        })
        .collect::<Vec<_>>();
    if matched.is_empty() {
        return Ok(());
    }
    wallet
        .mark_vtxos_as_spent(&matched)
        .await
        .map_err(bark_error)
}

async fn stop_offboards_that_name(
    wallet: &bark::Wallet,
    spent_ids: &[String],
) -> Result<(), String> {
    let pending = wallet.pending_offboards().await.map_err(bark_error)?;
    for offboard in pending {
        let names_spent_input = offboard_input_ids(&offboard)
            .iter()
            .any(|input_id| spent_ids.iter().any(|spent_id| spent_id == input_id));
        if names_spent_input {
            wallet
                .stop_wallet_action(&offboard.id)
                .await
                .map_err(bark_error)?;
        }
    }
    Ok(())
}
