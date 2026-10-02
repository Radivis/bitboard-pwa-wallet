//! Collaborative exit priced at the app's sat/vB rate.
//!
//! `Wallet::send_onchain` and `Wallet::offboard_all` always commit
//! `ServerConnection::offboard_feerate`. On public Signet that tracks Second's
//! Esplora, about 199 sat/vB. The app's mempool.space Signet preset is passed
//! in instead, and the same rate is what the offboard action commits.

use std::collections::HashSet;

use anyhow::anyhow;
use bitcoin::Amount;
use bitcoin::hex::DisplayHex;
use wasm_bindgen::prelude::*;

use crate::board::BarkBoardFeeEstimate;
use crate::emergency_exit::fee_rate_from_sat_per_vb;
use crate::exit_address::{classify_offboard_failure, parse_receive_address};
use crate::session::{
    bark_error, finish_wallet_operation, require_session_synced, session_bitcoin_network,
    take_active_wallet,
};

use bark::WalletVtxo;
use bark::actions::offboard::{Offboard, OffboardKind, Progress};
use bark::actions::{DriveMode, WalletActionId};
use bark::ark::VtxoId;
use bark::ark::fees::{VtxoFeeInfo, validate_and_subtract_fee_min_dust};
use bark::vtxo::selection::InputSelection;

pub struct CollaborativeExitEstimate {
    pub gross_amount_sats: u64,
    pub fee_sats: u64,
    pub net_amount_sats: u64,
}

struct PricedSend {
    input_vtxos: Vec<WalletVtxo>,
    fee: Amount,
}

struct PricedOffboardAll {
    input_vtxos: Vec<WalletVtxo>,
    fee: Amount,
    net_amount: Amount,
}

fn display_err(err: impl std::fmt::Display) -> String {
    err.to_string()
}

fn new_offboard_action_id() -> Result<WalletActionId, String> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).map_err(display_err)?;
    Ok(bytes.as_hex().to_string())
}

/// Matches Bark's change split so a large change output is not one VTXO.
fn change_pieces_for_offboard(change: Amount, pay: Amount, split_factor: u8) -> Vec<Amount> {
    if change == Amount::ZERO {
        return Vec::new();
    }
    let piece_count = if change > pay {
        u64::from(split_factor.max(1))
    } else {
        1
    };
    let base = change / piece_count;
    let mut pieces = vec![base; piece_count as usize];
    if let Some(last) = pieces.last_mut() {
        *last = change - base * (piece_count - 1);
    }
    pieces
}

fn reject_duplicate_inputs(input_vtxo_ids: &[VtxoId]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for vtxo_id in input_vtxo_ids {
        if !seen.insert(*vtxo_id) {
            return Err("offboard inputs must not contain duplicates".to_owned());
        }
    }
    Ok(())
}

async fn price_send_onchain(
    wallet: &bark::Wallet,
    destination: &bitcoin::Address,
    amount: Amount,
    fee_rate: bitcoin::FeeRate,
) -> Result<PricedSend, String> {
    let ark_info = wallet.require_ark_info().await.map_err(display_err)?;
    let dust = destination.script_pubkey().minimal_non_dust();
    if amount < dust {
        return Err(format!(
            "the minimum you can send to {destination} is {dust}"
        ));
    }

    let script = destination.script_pubkey();
    let tip = wallet.chain().tip().await.map_err(display_err)?;
    let spendable = wallet.spendable_vtxos().await.map_err(display_err)?;
    let (input_vtxos, fee) = InputSelection::new()
        .max_exit_depth(ark_info.max_vtxo_exit_depth)
        .max_inputs(ark_info.max_offboard_inputs)
        .fee_scheme(tip, |selected_amount, vtxo_infos| {
            ark_info
                .fees
                .offboard
                .calculate(&script, selected_amount, fee_rate, vtxo_infos)
                .ok_or_else(|| anyhow!("failed to calculate offboard fee for {selected_amount}"))
        })
        .select(spendable, amount)
        .map_err(display_err)?;

    Ok(PricedSend { input_vtxos, fee })
}

async fn price_offboard_all(
    wallet: &bark::Wallet,
    destination: &bitcoin::Address,
    fee_rate: bitcoin::FeeRate,
) -> Result<PricedOffboardAll, String> {
    let ark_info = wallet.require_ark_info().await.map_err(display_err)?;
    let input_vtxos = wallet.spendable_vtxos().await.map_err(display_err)?;
    if input_vtxos.is_empty() {
        return Err("Bark exit has no spendable funds".to_owned());
    }
    if input_vtxos.len() > ark_info.max_offboard_inputs {
        return Err(format!(
            "max inputs for offboard is {}, {} were provided",
            ark_info.max_offboard_inputs,
            input_vtxos.len(),
        ));
    }

    let tip = wallet.chain().tip().await.map_err(display_err)?;
    let gross_amount = input_vtxos.iter().map(|vtxo| vtxo.amount()).sum::<Amount>();
    let script = destination.script_pubkey();
    let fee_infos = input_vtxos
        .iter()
        .map(|vtxo| VtxoFeeInfo::from_vtxo_and_tip(vtxo, tip));
    let fee = ark_info
        .fees
        .offboard
        .calculate(&script, gross_amount, fee_rate, fee_infos)
        .ok_or_else(|| "failed to calculate offboard fee".to_owned())?;
    let dust = script.minimal_non_dust();
    let net_amount =
        validate_and_subtract_fee_min_dust(gross_amount, fee, dust).map_err(display_err)?;

    Ok(PricedOffboardAll {
        input_vtxos,
        fee,
        net_amount,
    })
}

pub async fn estimate_send_onchain(
    wallet: &bark::Wallet,
    destination: &bitcoin::Address,
    amount: Amount,
    fee_rate: bitcoin::FeeRate,
) -> Result<CollaborativeExitEstimate, String> {
    let priced = price_send_onchain(wallet, destination, amount, fee_rate).await?;
    let gross_amount = amount
        .checked_add(priced.fee)
        .ok_or_else(|| "Bark exit amount plus fee overflowed".to_owned())?;
    Ok(CollaborativeExitEstimate {
        gross_amount_sats: gross_amount.to_sat(),
        fee_sats: priced.fee.to_sat(),
        net_amount_sats: amount.to_sat(),
    })
}

pub async fn estimate_offboard_all(
    wallet: &bark::Wallet,
    destination: &bitcoin::Address,
    fee_rate: bitcoin::FeeRate,
) -> Result<CollaborativeExitEstimate, String> {
    let priced = price_offboard_all(wallet, destination, fee_rate).await?;
    let gross_amount = priced
        .input_vtxos
        .iter()
        .map(|vtxo| vtxo.amount())
        .sum::<Amount>();
    Ok(CollaborativeExitEstimate {
        gross_amount_sats: gross_amount.to_sat(),
        fee_sats: priced.fee.to_sat(),
        net_amount_sats: priced.net_amount.to_sat(),
    })
}

async fn drive_offboard(wallet: &bark::Wallet, action: Offboard) -> Result<bitcoin::Txid, String> {
    let offboard_id = action.id();
    wallet
        .drive_action(action, DriveMode::UntilParkOrDone)
        .await
        .map_err(display_err)?;
    let checkpoint = wallet
        .offboard_checkpoint(&offboard_id)
        .await
        .map_err(display_err)?;
    match checkpoint {
        Some(offboard) => match offboard.progress {
            Progress::AwaitingConfirmations { offboard_txid, .. } => Ok(offboard_txid),
            _ => Err(format!(
                "offboard {offboard_id} could not complete yet; it remains pending and will be retried on wallet sync"
            )),
        },
        None => Err(format!(
            "offboard {offboard_id} finished without producing a txid"
        )),
    }
}

pub async fn send_onchain(
    wallet: &bark::Wallet,
    destination: bitcoin::Address,
    amount: Amount,
    fee_rate: bitcoin::FeeRate,
) -> Result<bitcoin::Txid, String> {
    let priced = price_send_onchain(wallet, &destination, amount, fee_rate).await?;
    let input_total = priced
        .input_vtxos
        .iter()
        .map(|vtxo| vtxo.amount())
        .sum::<Amount>();
    let pay = amount
        .checked_add(priced.fee)
        .ok_or_else(|| "Bark exit amount plus fee overflowed".to_owned())?;
    let change = input_total
        .checked_sub(pay)
        .ok_or_else(|| "selected inputs don't cover amount plus fee".to_owned())?;

    let (_, arkoor_key_index) = wallet
        .derive_store_next_keypair()
        .await
        .map_err(display_err)?;
    let (_, change_key_index) = wallet
        .derive_store_next_keypair()
        .await
        .map_err(display_err)?;
    let input_vtxo_ids: Vec<VtxoId> = priced.input_vtxos.iter().map(|vtxo| vtxo.id()).collect();
    reject_duplicate_inputs(&input_vtxo_ids)?;

    let action = Offboard {
        id: new_offboard_action_id()?,
        destination: destination.into_unchecked(),
        onchain_output_amount: amount,
        committed_fee: priced.fee,
        committed_fee_rate: fee_rate,
        kind: OffboardKind::SendOnchain {
            input_vtxo_ids,
            arkoor_key_index,
            change_key_index,
            change_pieces: Some(change_pieces_for_offboard(
                change,
                pay,
                wallet.config().change_vtxo_split_factor,
            )),
        },
        progress: Progress::Start,
    };
    drive_offboard(wallet, action).await
}

pub async fn offboard_all(
    wallet: &bark::Wallet,
    destination: bitcoin::Address,
    fee_rate: bitcoin::FeeRate,
) -> Result<bitcoin::Txid, String> {
    let priced = price_offboard_all(wallet, &destination, fee_rate).await?;
    let input_vtxo_ids: Vec<VtxoId> = priced.input_vtxos.iter().map(|vtxo| vtxo.id()).collect();
    reject_duplicate_inputs(&input_vtxo_ids)?;

    let action = Offboard {
        id: new_offboard_action_id()?,
        destination: destination.into_unchecked(),
        onchain_output_amount: priced.net_amount,
        committed_fee: priced.fee,
        committed_fee_rate: fee_rate,
        kind: OffboardKind::OffboardWhole { input_vtxo_ids },
        progress: Progress::Start,
    };
    drive_offboard(wallet, action).await
}

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

fn fee_estimate_from_collaborative(estimate: CollaborativeExitEstimate) -> BarkBoardFeeEstimate {
    BarkBoardFeeEstimate::from_parts(
        estimate.gross_amount_sats,
        estimate.fee_sats,
        estimate.net_amount_sats,
    )
}

fn exit_fee_rate(fee_rate_sat_per_vb: f64) -> Result<bitcoin::FeeRate, JsValue> {
    fee_rate_from_sat_per_vb(fee_rate_sat_per_vb).map_err(|err| JsValue::from_str(&err))
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
            let ids_after = pending_offboard_ids(wallet).await.unwrap_or_default();
            Err(classify_offboard_failure(&ids_before, &ids_after, &message))
        }
    }
}

/// Fee for paying `amount_sats` on-chain at the app's sat/vB rate. `net_amount_sats` is what arrives.
#[wasm_bindgen]
pub async fn bark_estimate_send_onchain(
    address: String,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
) -> Result<BarkBoardFeeEstimate, JsValue> {
    require_exit_amount(amount_sats)?;
    let destination = exit_destination(&address)?;
    let fee_rate = exit_fee_rate(fee_rate_sat_per_vb)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = estimate_send_onchain(
            &wallet,
            &destination,
            bitcoin::Amount::from_sat(amount_sats),
            fee_rate,
        )
        .await?;
        Ok(fee_estimate_from_collaborative(estimate))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Pays `amount_sats` to an address on the open network at the app's sat/vB rate.
/// Returns the offboard txid once broadcast.
/// A park before broadcast is `bark_offboard_parked` when this attempt created a checkpoint.
#[wasm_bindgen]
pub async fn bark_send_onchain(
    address: String,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
) -> Result<String, JsValue> {
    require_exit_amount(amount_sats)?;
    let destination = exit_destination(&address)?;
    let fee_rate = exit_fee_rate(fee_rate_sat_per_vb)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let ids_before = pending_offboard_ids(&wallet).await?;
        let result = send_onchain(
            &wallet,
            destination,
            bitcoin::Amount::from_sat(amount_sats),
            fee_rate,
        )
        .await;
        offboard_txid_or_parked(&wallet, ids_before, result).await
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Fee for offboarding every spendable VTXO at the app's sat/vB rate. `net_amount_sats` is what arrives.
#[wasm_bindgen]
pub async fn bark_estimate_offboard_all(
    address: String,
    fee_rate_sat_per_vb: f64,
) -> Result<BarkBoardFeeEstimate, JsValue> {
    let destination = exit_destination(&address)?;
    let fee_rate = exit_fee_rate(fee_rate_sat_per_vb)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let estimate = estimate_offboard_all(&wallet, &destination, fee_rate).await?;
        Ok(fee_estimate_from_collaborative(estimate))
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}

/// Offboards every spendable VTXO to an address on the open network at the app's sat/vB rate.
/// Returns the offboard txid once broadcast.
#[wasm_bindgen]
pub async fn bark_offboard_all(
    address: String,
    fee_rate_sat_per_vb: f64,
) -> Result<String, JsValue> {
    let destination = exit_destination(&address)?;
    let fee_rate = exit_fee_rate(fee_rate_sat_per_vb)?;
    let wallet = take_active_wallet().map_err(|err| JsValue::from_str(&err))?;
    let operation_result = async {
        let ids_before = pending_offboard_ids(&wallet).await?;
        let result = offboard_all(&wallet, destination, fee_rate).await;
        offboard_txid_or_parked(&wallet, ids_before, result).await
    }
    .await;
    finish_wallet_operation(wallet, operation_result).map_err(|err| JsValue::from_str(&err))
}
