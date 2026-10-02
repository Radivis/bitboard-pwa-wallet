//! BIP-431 Pay-to-Anchor child for a Bark emergency-exit parent.
//!
//! Bark's own on-chain wallet is disabled. This signs the child from the
//! wallet the user already has, spending confirmed coins only.

use bdk_wallet::KeychainKind;
use bdk_wallet::Wallet;
use bitcoin::consensus::encode::{deserialize_hex, serialize_hex};
use bitcoin::psbt::Input;
use bitcoin::{Amount, FeeRate, OutPoint, ScriptBuf, Transaction, TxOut, Weight, Witness};

use crate::error::CryptoError;
use crate::transaction::sign_transaction;
use crate::validation::fee_rate_from_sat_per_vb_float;

pub const BARK_CPFP_INSUFFICIENT_FUNDS: &str = "bark_cpfp_insufficient_funds";

/// Satisfaction weight BDK adds for the foreign anchor input.
/// A Pay-to-Anchor spend has an empty witness. That encodes as one byte
/// (witness stack length 0), and witness bytes count as one weight unit each.
const FEE_ANCHOR_SPEND_WEIGHT: Weight = Weight::from_wu(1);
const MAX_FEE_ITERATIONS: usize = 100;

/// Signed raw transaction hex. Does not insert the child into the wallet.
pub fn sign_p2a_cpfp_child(
    wallet: &mut Wallet,
    parent_tx_hex: &str,
    effective_fee_rate_sat_per_vb: f64,
    rbf_min_fee_rate_sat_per_kwu: Option<u64>,
    current_package_fee_sats: Option<u64>,
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
    let rbf_package_fee = rbf_package_fee(rbf_min_fee_rate_sat_per_kwu, current_package_fee_sats)?;
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
        fee_needed = package_fee(
            effective_fee_rate,
            parent_weight,
            child_weight,
            rbf_package_fee,
        );
    }
    Err(CryptoError::Transaction(
        "Could not settle a Pay-to-Anchor child fee".to_owned(),
    ))
}

fn rbf_package_fee(
    min_fee_rate_sat_per_kwu: Option<u64>,
    current_package_fee_sats: Option<u64>,
) -> Result<Option<(FeeRate, Amount)>, CryptoError> {
    match (min_fee_rate_sat_per_kwu, current_package_fee_sats) {
        (None, None) => Ok(None),
        (Some(min_fee_rate_sat_per_kwu), Some(current_package_fee_sats)) => Ok(Some((
            FeeRate::from_sat_per_kwu(min_fee_rate_sat_per_kwu),
            Amount::from_sat(current_package_fee_sats),
        ))),
        _ => Err(CryptoError::Transaction(
            "RBF fee rate and current package fee must be provided together".to_owned(),
        )),
    }
}

fn package_fee(
    effective_fee_rate: FeeRate,
    parent_weight: Weight,
    child_weight: Weight,
    rbf_package_fee: Option<(FeeRate, Amount)>,
) -> Amount {
    let total_weight = parent_weight + child_weight;
    let Some((min_effective_fee_rate, current_package_fee)) = rbf_package_fee else {
        return total_weight * effective_fee_rate;
    };
    let min_relay_fee = FeeRate::from_sat_per_vb(1).expect("1 sat/vb is a valid fee rate");
    let min_package_fee =
        current_package_fee + parent_weight * min_relay_fee + child_weight * min_relay_fee;
    let desired_fee = total_weight * min_effective_fee_rate;
    if desired_fee < min_package_fee {
        min_package_fee
    } else {
        desired_fee
    }
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
    tx_builder.drain_to(change_script.clone());
    tx_builder.fee_absolute(fee_needed);
    let mut psbt = match tx_builder.finish() {
        Ok(psbt) => psbt,
        Err(bdk_wallet::error::CreateTxError::CoinSelection(err)) => {
            return Err(insufficient_funds(err.to_string()));
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
