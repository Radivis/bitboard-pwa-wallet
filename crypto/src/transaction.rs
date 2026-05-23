use std::str::FromStr;

use bdk_wallet::{KeychainKind, Wallet};
use bitcoin::absolute;
use bitcoin::{Address, Amount, Network, Psbt, ScriptBuf, Transaction};
use serde::{Deserialize, Serialize};

use crate::error::CryptoError;
use crate::validation;

/// Product UX floor for typical P2WPKH-style outputs; BDK applies script-specific dust checks.
pub const UX_DUST_FLOOR_SATS: u64 = 546;

/// Input coin selected for a send, surfaced on the review step.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReviewInputUtxo {
    pub address: String,
    pub amount_sats: u64,
    pub txid: String,
    pub vout: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrepareOnchainSendOutcome {
    pub psbt_base64: String,
    pub final_amount_sats: u64,
    pub original_amount_sats: u64,
    pub raised_to_min_dust: bool,
    /// True only after a second build when `apply_change_free_bump` was requested and applicable.
    pub bumped_change_free: bool,
    /// User could optionally increase the payment to this amount (no sub-dust change).
    pub change_free_bump_available: bool,
    /// Set when `change_free_bump_available` (copy for UI; 0 if not available).
    pub change_free_max_sats: u64,
    /// Total fee in satoshis (input sum minus output sum on the unsigned tx).
    pub fee_sats: u64,
    /// Change output credited back to the wallet (0 when change-free).
    pub change_sats: u64,
    /// Sum of input values selected for this transaction.
    pub total_input_sats: u64,
    /// Coins that will be consumed as inputs.
    pub input_utxos: Vec<ReviewInputUtxo>,
}

fn sum_psbt_input_values(psbt: &Psbt) -> Result<u64, CryptoError> {
    if psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(CryptoError::Transaction(
            "PSBT input count mismatch".to_string(),
        ));
    }
    let mut sum = 0u64;
    for inp in &psbt.inputs {
        let amt = inp
            .witness_utxo
            .as_ref()
            .ok_or_else(|| CryptoError::Transaction("PSBT input missing witness_utxo".to_string()))?
            .value
            .to_sat();
        sum = sum
            .checked_add(amt)
            .ok_or_else(|| CryptoError::Transaction("Input value sum overflow".to_string()))?;
    }
    Ok(sum)
}

fn sum_unsigned_tx_output_values(tx: &Transaction) -> u64 {
    tx.output.iter().map(|o| o.value.to_sat()).sum()
}

/// Fee in satoshis from an unsigned PSBT (sum of inputs minus sum of outputs).
pub fn fee_sats_from_unsigned_psbt(psbt: &Psbt) -> Result<u64, CryptoError> {
    let vin_sum = sum_psbt_input_values(psbt)?;
    let vout_sum = sum_unsigned_tx_output_values(&psbt.unsigned_tx);
    Ok(vin_sum.saturating_sub(vout_sum))
}

/// Sum of output values paying to the wallet change script (0 when change-free).
pub fn change_sats_from_unsigned_psbt(psbt: &Psbt, change_spk: &ScriptBuf) -> u64 {
    psbt.unsigned_tx
        .output
        .iter()
        .filter(|output| output.script_pubkey == *change_spk)
        .map(|output| output.value.to_sat())
        .sum()
}

/// Resolve wallet-owned PSBT inputs to review rows (address + amount + outpoint).
pub fn review_inputs_from_wallet_psbt(
    wallet: &Wallet,
    psbt: &Psbt,
) -> Result<Vec<ReviewInputUtxo>, CryptoError> {
    if psbt.inputs.len() != psbt.unsigned_tx.input.len() {
        return Err(CryptoError::Transaction(
            "PSBT input count mismatch".to_string(),
        ));
    }

    let mut input_utxos = Vec::with_capacity(psbt.unsigned_tx.input.len());
    for (idx, txin) in psbt.unsigned_tx.input.iter().enumerate() {
        let outpoint = txin.previous_output;
        let amount_sats = psbt.inputs[idx]
            .witness_utxo
            .as_ref()
            .ok_or_else(|| CryptoError::Transaction("PSBT input missing witness_utxo".to_string()))?
            .value
            .to_sat();

        let local_output = wallet
            .list_unspent()
            .find(|local_utxo| local_utxo.outpoint == outpoint)
            .ok_or_else(|| {
                CryptoError::Transaction(format!(
                    "PSBT input outpoint not found in wallet UTXOs: {}:{}",
                    outpoint.txid, outpoint.vout
                ))
            })?;

        let address = wallet
            .peek_address(local_output.keychain, local_output.derivation_index)
            .address
            .to_string();

        input_utxos.push(ReviewInputUtxo {
            address,
            amount_sats,
            txid: outpoint.txid.to_string(),
            vout: outpoint.vout,
        });
    }

    Ok(input_utxos)
}

/// Build a PSBT with dust-floor clamp. When `apply_change_free_bump` is false (default for first
/// pass), never increases payment for change-free max; sets `change_free_bump_available` when the
/// user may choose a higher payment. When true, applies that bump if possible.
pub fn prepare_onchain_send(
    wallet: &mut Wallet,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    network: Network,
    apply_change_free_bump: bool,
) -> Result<PrepareOnchainSendOutcome, CryptoError> {
    if amount_sats == 0 {
        return Err(CryptoError::Transaction(
            "Amount must be greater than zero".to_string(),
        ));
    }

    let original_amount_sats = amount_sats;
    let mut raised_to_min_dust = false;
    let mut final_amt = amount_sats;
    if final_amt < UX_DUST_FLOOR_SATS {
        final_amt = UX_DUST_FLOOR_SATS;
        raised_to_min_dust = true;
    }

    let address = Address::from_str(recipient_address)?
        .require_network(network)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;
    let recipient_spk = address.script_pubkey();

    let fee_rate = validation::fee_rate_from_sat_per_vb_float(fee_rate_sat_per_vb)?;

    // `nLockTime = 0` instead of BDK’s default (tip-based fee-sniping lock time) — see
    // `doc/ARCHITECTURE.md` (On-chain sends: nLockTime and fee sniping).
    let build_once = |w: &mut Wallet, amt: u64| -> Result<Psbt, CryptoError> {
        let mut tx_builder = w.build_tx();
        tx_builder
            .nlocktime(absolute::LockTime::ZERO)
            .add_recipient(recipient_spk.clone(), Amount::from_sat(amt))
            .fee_rate(fee_rate);
        tx_builder.finish().map_err(CryptoError::from)
    };

    let mut psbt = build_once(wallet, final_amt)?;
    let mut bumped_change_free = false;

    let unsigned = psbt.unsigned_tx.clone();
    let single_recipient_only =
        unsigned.output.len() == 1 && unsigned.output[0].script_pubkey == recipient_spk;

    let mut change_free_bump_available = false;
    let mut change_free_max_sats = 0u64;

    if single_recipient_only {
        let vin_sum = sum_psbt_input_values(&psbt)?;
        let min_total_fee = fee_rate.fee_wu(unsigned.weight()).ok_or_else(|| {
            CryptoError::Transaction("Fee overflow for transaction weight".to_string())
        })?;
        let max_recipient = vin_sum.saturating_sub(min_total_fee.to_sat());
        if max_recipient > final_amt {
            change_free_bump_available = true;
            change_free_max_sats = max_recipient;
            if apply_change_free_bump {
                match build_once(wallet, max_recipient) {
                    Ok(psbt2) => {
                        psbt = psbt2;
                        final_amt = max_recipient;
                        bumped_change_free = true;
                    }
                    Err(_) => {
                        // Keep first PSBT; user still gets a valid tx without bump.
                    }
                }
            }
        }
    }

    let fee_sats = fee_sats_from_unsigned_psbt(&psbt)?;
    let total_input_sats = sum_psbt_input_values(&psbt)?;
    let input_utxos = review_inputs_from_wallet_psbt(wallet, &psbt)?;
    let change_spk = psbt
        .unsigned_tx
        .output
        .iter()
        .find(|output| output.script_pubkey != recipient_spk)
        .map(|output| output.script_pubkey.clone())
        .unwrap_or_else(|| {
            wallet
                .peek_address(
                    KeychainKind::Internal,
                    wallet.next_derivation_index(KeychainKind::Internal),
                )
                .address
                .script_pubkey()
        });
    let change_sats = change_sats_from_unsigned_psbt(&psbt, &change_spk);

    Ok(PrepareOnchainSendOutcome {
        psbt_base64: psbt.to_string(),
        final_amount_sats: final_amt,
        original_amount_sats,
        raised_to_min_dust,
        bumped_change_free,
        change_free_bump_available,
        change_free_max_sats,
        fee_sats,
        change_sats,
        total_input_sats,
        input_utxos,
    })
}

pub fn build_transaction(
    wallet: &mut Wallet,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    network: Network,
) -> Result<Psbt, CryptoError> {
    let outcome = prepare_onchain_send(
        wallet,
        recipient_address,
        amount_sats,
        fee_rate_sat_per_vb,
        network,
        false,
    )?;
    outcome
        .psbt_base64
        .parse()
        .map_err(|e: bitcoin::psbt::PsbtParseError| CryptoError::Transaction(e.to_string()))
}

// BDK wallet.sign(SignOptions) is deprecated; required until BDK provides replacement API.
#[allow(deprecated)]
pub fn sign_transaction(wallet: &Wallet, psbt: &mut Psbt) -> Result<bool, CryptoError> {
    use bdk_wallet::SignOptions;
    let finalized = wallet.sign(psbt, SignOptions::default())?;
    Ok(finalized)
}

pub fn extract_transaction(psbt: Psbt) -> Result<Transaction, CryptoError> {
    psbt.extract_tx()
        .map_err(|e| CryptoError::Transaction(e.to_string()))
}
