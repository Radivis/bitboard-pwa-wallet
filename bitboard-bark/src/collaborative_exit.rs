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
