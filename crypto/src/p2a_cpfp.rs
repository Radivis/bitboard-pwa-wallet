//! BIP-431 Pay-to-Anchor child for a Bark emergency-exit parent.
//!
//! Bark's own on-chain wallet is disabled. This signs the child from the
//! wallet the user already has, spending confirmed coins only.

use bdk_wallet::KeychainKind;
use bdk_wallet::Wallet;
use bitcoin::consensus::encode::{deserialize_hex, serialize_hex};
use bitcoin::psbt::Input;
use bitcoin::transaction::Version;
use bitcoin::{Amount, OutPoint, ScriptBuf, Transaction, TxOut, Weight, Witness};

use crate::error::CryptoError;
use crate::transaction::sign_transaction;
use crate::validation::fee_rate_from_sat_per_vb_float;

pub const BARK_CPFP_INSUFFICIENT_FUNDS: &str = "bark_cpfp_insufficient_funds";
/// `bark_cpfp_insufficient_funds: needed_sats=<sats>; <detail>`, read by
/// `barkCpfpShortfallNeededSats` in `frontend/src/lib/bark/perform-bark-emergency-exit.ts`.
pub const BARK_CPFP_NEEDED_SATS_LABEL: &str = "needed_sats";

/// Satisfaction weight BDK adds for the foreign anchor input.
/// A Pay-to-Anchor spend has an empty witness. That encodes as one byte
/// (witness stack length 0), and witness bytes count as one weight unit each.
const FEE_ANCHOR_SPEND_WEIGHT: Weight = Weight::from_wu(1);
const MAX_FEE_ITERATIONS: usize = 100;

/// Version-3 child that spends a Pay-to-Anchor (empty witness) and a signed wallet coin.
/// Bark emergency-exit children and Arkade unilateral-exit bump children share this shape.
pub fn is_pay_to_anchor_cpfp_child(tx: &Transaction) -> bool {
    if tx.version != Version(3) {
        return false;
    }
    let has_anchor_input = tx
        .input
        .iter()
        .any(|input| input.script_sig.is_empty() && input.witness.is_empty());
    let has_signed_input = tx.input.iter().any(|input| !input.witness.is_empty());
    has_anchor_input && has_signed_input
}

/// Signed raw transaction hex. Does not insert the child into the wallet.
pub fn sign_p2a_cpfp_child(
    wallet: &mut Wallet,
    parent_tx_hex: &str,
    effective_fee_rate_sat_per_vb: f64,
) -> Result<String, CryptoError> {
    let parent_tx = deserialize_hex::<Transaction>(parent_tx_hex)
        .map_err(|err| CryptoError::Transaction(format!("Parent transaction is invalid: {err}")))?;
    let (anchor_outpoint, anchor_output) = fee_anchor(&parent_tx).ok_or_else(|| {
        CryptoError::Transaction(format!(
            "Parent {} has no Pay-to-Anchor output",
            parent_tx.compute_txid()
        ))
    })?;
    let effective_fee_rate = fee_rate_from_sat_per_vb_float(effective_fee_rate_sat_per_vb)?;
    let change_script = wallet
        .reveal_next_address(KeychainKind::Internal)
        .address
        .script_pubkey();

    let parent_weight = parent_tx.weight();
    let mut fee_needed = parent_weight * effective_fee_rate;
    let mut settled_child_weight = Weight::ZERO;
    for _ in 0..MAX_FEE_ITERATIONS {
        let child_tx = build_child(
            wallet,
            anchor_outpoint,
            &anchor_output,
            &change_script,
            fee_needed,
        )?;
        let child_weight = child_tx.weight();
        if child_weight == settled_child_weight {
            return Ok(serialize_hex(&child_tx));
        }
        settled_child_weight = child_weight;
        fee_needed = (parent_weight + child_weight) * effective_fee_rate;
    }
    Err(CryptoError::Transaction(
        "Could not settle a Pay-to-Anchor child fee".to_owned(),
    ))
}

fn fee_anchor(parent_tx: &Transaction) -> Option<(OutPoint, TxOut)> {
    let pay_to_anchor = ScriptBuf::new_p2a();
    parent_tx
        .output
        .iter()
        .enumerate()
        .find(|(_, output)| output.script_pubkey == pay_to_anchor)
        .map(|(vout, output)| {
            (
                OutPoint {
                    txid: parent_tx.compute_txid(),
                    vout: vout as u32,
                },
                output.clone(),
            )
        })
}

fn build_child(
    wallet: &mut Wallet,
    anchor_outpoint: OutPoint,
    anchor_output: &TxOut,
    change_script: &bitcoin::ScriptBuf,
    fee_needed: Amount,
) -> Result<Transaction, CryptoError> {
    let first_try = finish_child(
        wallet,
        anchor_outpoint,
        anchor_output,
        change_script,
        fee_needed,
        None,
    );
    if !is_insufficient_funds(&first_try) {
        return first_try;
    }
    // Branch-and-bound can spend a coin that covers the absolute fee and then
    // reject the result because the leftover change is dust. A larger confirmed
    // coin still pays the fee. The dust error's "needed" amount is only the dust
    // threshold, so callers must not treat it as a balance shortfall.
    let Some(largest_outpoint) = largest_confirmed_outpoint(wallet) else {
        return first_try;
    };
    finish_child(
        wallet,
        anchor_outpoint,
        anchor_output,
        change_script,
        fee_needed,
        Some(largest_outpoint),
    )
}

fn is_insufficient_funds(result: &Result<Transaction, CryptoError>) -> bool {
    matches!(result, Err(err) if err.to_string().contains(BARK_CPFP_INSUFFICIENT_FUNDS))
}

fn largest_confirmed_outpoint(wallet: &Wallet) -> Option<OutPoint> {
    let tip_height = wallet.latest_checkpoint().height();
    wallet
        .list_unspent()
        .filter(|utxo| {
            let confirmations = utxo
                .chain_position
                .confirmation_height_upper_bound()
                .map_or(0, |height| {
                    tip_height.saturating_add(1).saturating_sub(height)
                });
            confirmations >= 1
        })
        .max_by_key(|utxo| utxo.txout.value)
        .map(|utxo| utxo.outpoint)
}

fn finish_child(
    wallet: &mut Wallet,
    anchor_outpoint: OutPoint,
    anchor_output: &TxOut,
    change_script: &bitcoin::ScriptBuf,
    fee_needed: Amount,
    required_outpoint: Option<OutPoint>,
) -> Result<Transaction, CryptoError> {
    let mut tx_builder = wallet.build_tx();
    tx_builder.only_witness_utxo();
    tx_builder.exclude_unconfirmed();
    tx_builder.version(3);
    let anchor_input = Input {
        witness_utxo: Some(anchor_output.clone()),
        final_script_witness: Some(Witness::new()),
        ..Default::default()
    };
    tx_builder
        .add_foreign_utxo(anchor_outpoint, anchor_input, FEE_ANCHOR_SPEND_WEIGHT)
        .map_err(|err| CryptoError::Transaction(err.to_string()))?;
    if let Some(outpoint) = required_outpoint {
        tx_builder
            .add_utxo(outpoint)
            .map_err(|err| CryptoError::Transaction(err.to_string()))?;
    }
    tx_builder.drain_to(change_script.clone());
    tx_builder.fee_absolute(fee_needed);
    let mut psbt = match tx_builder.finish() {
        Ok(psbt) => psbt,
        Err(bdk_wallet::error::CreateTxError::CoinSelection(err)) => {
            return Err(insufficient_funds(format!(
                "{BARK_CPFP_NEEDED_SATS_LABEL}={}; {err}",
                err.needed.to_sat()
            )));
        }
        Err(bdk_wallet::error::CreateTxError::OutputBelowDustLimit(_)) => {
            return Err(insufficient_funds(
                "Confirmed coins cannot cover the child fee and a non-dust change output"
                    .to_owned(),
            ));
        }
        Err(err) => return Err(CryptoError::from(err)),
    };
    let finalized = sign_transaction(wallet, &mut psbt)?;
    if !finalized {
        return Err(CryptoError::Transaction(
            "Pay-to-Anchor child could not be fully signed".to_owned(),
        ));
    }
    let child_tx = psbt
        .extract_tx()
        .map_err(|err| CryptoError::Transaction(err.to_string()))?;
    if !child_tx
        .input
        .iter()
        .any(|input| input.previous_output == anchor_outpoint)
    {
        return Err(CryptoError::Transaction(
            "Pay-to-Anchor child does not spend the parent anchor".to_owned(),
        ));
    }
    Ok(child_tx)
}

fn insufficient_funds(detail: String) -> CryptoError {
    CryptoError::Transaction(format!("{BARK_CPFP_INSUFFICIENT_FUNDS}: {detail}"))
}
