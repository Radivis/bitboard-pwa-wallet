use std::str::FromStr;

use bdk_wallet::Wallet;
use bitcoin::absolute;
use bitcoin::{Address, Amount, Network, Psbt, Transaction};
use serde::Serialize;

use crate::error::CryptoError;
use crate::validation;

/// Product UX floor for typical P2WPKH-style outputs; BDK applies script-specific dust checks.
pub const UX_DUST_FLOOR_SATS: u64 = 546;

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

    Ok(PrepareOnchainSendOutcome {
        psbt_base64: psbt.to_string(),
        final_amount_sats: final_amt,
        original_amount_sats,
        raised_to_min_dust,
        bumped_change_free,
        change_free_bump_available,
        change_free_max_sats,
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
