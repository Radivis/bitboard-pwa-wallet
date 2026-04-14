//! BDK-based lab transaction build and sign.
//!
//! Uses `add_foreign_utxo` to build a PSBT from lab UTXOs (not in wallet DB),
//! then signs via the wallet's descriptor. Unifies lab and mainnet signing paths.

use std::str::FromStr;

// SignOptions is deprecated in BDK in favor of bitcoin::psbt; we still need it until we migrate.
#[allow(deprecated)]
use bdk_wallet::{KeychainKind, SignOptions};
use bitcoin::{Address, Amount, FeeRate, Network, OutPoint, Psbt, ScriptBuf, TxOut, Txid, psbt};

use crate::error::CryptoError;
use crate::lab::LabUtxoInput;
use crate::transaction;
use crate::transaction::UX_DUST_FLOOR_SATS;
use crate::validation;
use serde::Serialize;

/// Result of building and signing a lab transaction via the wallet (PSBT path).
#[derive(Debug, Clone)]
pub struct LabSignedTransactionResult {
    /// Serialized signed transaction (raw bytes).
    pub signed_tx_bytes: Vec<u8>,
    /// Total fee in satoshis.
    pub fee_sats: u64,
    /// Whether the transaction has a change output back to the wallet.
    pub has_change: bool,
}

/// Unsigned lab PSBT plus dust / change-free metadata (before the user confirms signing).
#[derive(Debug, Serialize)]
pub struct LabDraftPsbtOutcome {
    pub psbt_base64: String,
    pub final_amount_sats: u64,
    pub original_amount_sats: u64,
    pub raised_to_min_dust: bool,
    pub change_free_bump_available: bool,
    pub change_free_max_sats: u64,
}

#[derive(Debug, Serialize)]
pub struct LabPrepareSendOutcome {
    pub signed_tx_hex: String,
    pub fee_sats: u64,
    pub has_change: bool,
    pub final_amount_sats: u64,
    pub original_amount_sats: u64,
    pub raised_to_min_dust: bool,
    pub bumped_change_free: bool,
    pub change_free_bump_available: bool,
    pub change_free_max_sats: u64,
}

struct LabPsbtBuildMeta {
    final_amount_sats: u64,
    original_amount_sats: u64,
    raised_to_min_dust: bool,
    bumped_change_free: bool,
    change_free_bump_available: bool,
    change_free_max_sats: u64,
}

fn finish_lab_psbt(
    wallet: &mut bdk_wallet::Wallet,
    utxos: &[LabUtxoInput],
    payment_sats: u64,
    to_address: &Address,
    change_address: &Address,
    satisfaction_weight: bitcoin::Weight,
    fee_rate: FeeRate,
) -> Result<Psbt, CryptoError> {
    let mut tx_builder = wallet.build_tx();
    tx_builder
        .manually_selected_only()
        .only_witness_utxo()
        .add_recipient(to_address.script_pubkey(), Amount::from_sat(payment_sats))
        .drain_to(change_address.script_pubkey())
        .fee_rate(fee_rate);

    for utxo in utxos {
        let txid =
            Txid::from_str(&utxo.txid).map_err(|e| CryptoError::Transaction(e.to_string()))?;
        let outpoint = OutPoint::new(txid, utxo.vout);

        let script_bytes = hex::decode(&utxo.script_pubkey_hex)
            .map_err(|e| CryptoError::Transaction(e.to_string()))?;
        let script_pubkey = ScriptBuf::from_bytes(script_bytes);

        let txout = TxOut {
            value: Amount::from_sat(utxo.amount_sats),
            script_pubkey,
        };

        let psbt_input = psbt::Input {
            witness_utxo: Some(txout),
            ..Default::default()
        };

        tx_builder
            .add_foreign_utxo(outpoint, psbt_input, satisfaction_weight)
            .map_err(|e| CryptoError::Transaction(e.to_string()))?;
    }

    tx_builder
        .finish()
        .map_err(|e| CryptoError::Transaction(e.to_string()))
}

fn prepare_lab_psbt_inner(
    wallet: &mut bdk_wallet::Wallet,
    utxos: &[LabUtxoInput],
    amount_sats: u64,
    to_address: &Address,
    change_address: &Address,
    satisfaction_weight: bitcoin::Weight,
    fee_rate: FeeRate,
    apply_change_free_bump: bool,
) -> Result<(Psbt, LabPsbtBuildMeta), CryptoError> {
    let total_in: u64 = utxos.iter().map(|u| u.amount_sats).sum();
    let original_amount_sats = amount_sats;
    let mut raised_to_min_dust = false;
    let mut final_amt = amount_sats;
    if final_amt < UX_DUST_FLOOR_SATS {
        final_amt = UX_DUST_FLOOR_SATS;
        raised_to_min_dust = true;
    }
    if final_amt >= total_in {
        return Err(CryptoError::Transaction(
            "Payment amount must be less than total inputs".to_string(),
        ));
    }

    let mut psbt = finish_lab_psbt(
        wallet,
        utxos,
        final_amt,
        to_address,
        change_address,
        satisfaction_weight,
        fee_rate,
    )?;

    let mut bumped_change_free = false;
    let mut change_free_bump_available = false;
    let mut change_free_max_sats = 0u64;

    let unsigned = psbt.unsigned_tx.clone();
    let pay_spk = to_address.script_pubkey();
    let single_recipient_only =
        unsigned.output.len() == 1 && unsigned.output[0].script_pubkey == pay_spk;

    if single_recipient_only {
        let min_total_fee = fee_rate.fee_wu(unsigned.weight()).ok_or_else(|| {
            CryptoError::Transaction("Fee overflow for transaction weight".to_string())
        })?;
        let max_recipient = total_in.saturating_sub(min_total_fee.to_sat());
        if max_recipient > final_amt && max_recipient < total_in {
            change_free_bump_available = true;
            change_free_max_sats = max_recipient;
            if apply_change_free_bump {
                // `max_recipient` uses the weight of the first single-output draft. The bumped
                // PSBT can differ slightly in weight, so min fee can be a few sats higher and BDK
                // can reject `max_recipient` as "Insufficient funds". Walk down until a build succeeds.
                let mut try_amt = max_recipient;
                let mut last_err: Option<String> = None;
                while try_amt > final_amt {
                    match finish_lab_psbt(
                        wallet,
                        utxos,
                        try_amt,
                        to_address,
                        change_address,
                        satisfaction_weight,
                        fee_rate,
                    ) {
                        Ok(psbt2) => {
                            psbt = psbt2;
                            final_amt = try_amt;
                            bumped_change_free = true;
                            break;
                        }
                        Err(e) => {
                            last_err = Some(e.to_string());
                            try_amt = try_amt.saturating_sub(1);
                        }
                    }
                }
                if !bumped_change_free {
                    return Err(CryptoError::Transaction(last_err.unwrap_or_else(|| {
                        "Change-free bump could not be built within available funds".to_string()
                    })));
                }
            }
        }
    }

    Ok((
        psbt,
        LabPsbtBuildMeta {
            final_amount_sats: final_amt,
            original_amount_sats,
            raised_to_min_dust,
            bumped_change_free,
            change_free_bump_available,
            change_free_max_sats,
        },
    ))
}

fn resolve_lab_send_inputs(
    wallet: &mut bdk_wallet::Wallet,
    utxos_json: &str,
    to_address_str: &str,
    change_address_str: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
) -> Result<
    (
        Vec<LabUtxoInput>,
        Address,
        Address,
        bitcoin::Weight,
        FeeRate,
    ),
    CryptoError,
> {
    if amount_sats == 0 {
        return Err(CryptoError::Transaction(
            "Amount must be greater than zero".to_string(),
        ));
    }

    let utxos: Vec<LabUtxoInput> =
        serde_json::from_str(utxos_json).map_err(|e| CryptoError::Transaction(e.to_string()))?;

    if utxos.is_empty() {
        return Err(CryptoError::Transaction(
            "At least one UTXO required".to_string(),
        ));
    }

    let to_address = Address::from_str(to_address_str)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let change_address = Address::from_str(change_address_str)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let satisfaction_weight = wallet
        .public_descriptor(KeychainKind::External)
        .max_weight_to_satisfy()
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let fee_rate_sats = validation::validate_fee_rate_sat_per_vb(fee_rate_sat_per_vb)?;
    let fee_rate = FeeRate::from_sat_per_vb_unchecked(fee_rate_sats);

    Ok((
        utxos,
        to_address,
        change_address,
        satisfaction_weight,
        fee_rate,
    ))
}

/// Build an unsigned lab PSBT for preview (no wallet signing).
pub fn prepare_lab_psbt_draft(
    wallet: &mut bdk_wallet::Wallet,
    utxos_json: &str,
    to_address_str: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address_str: &str,
) -> Result<LabDraftPsbtOutcome, CryptoError> {
    let (utxos, to_address, change_address, satisfaction_weight, fee_rate) =
        resolve_lab_send_inputs(
            wallet,
            utxos_json,
            to_address_str,
            change_address_str,
            amount_sats,
            fee_rate_sat_per_vb,
        )?;
    let (psbt, meta) = prepare_lab_psbt_inner(
        wallet,
        &utxos,
        amount_sats,
        &to_address,
        &change_address,
        satisfaction_weight,
        fee_rate,
        false,
    )?;
    Ok(LabDraftPsbtOutcome {
        psbt_base64: psbt.to_string(),
        final_amount_sats: meta.final_amount_sats,
        original_amount_sats: meta.original_amount_sats,
        raised_to_min_dust: meta.raised_to_min_dust,
        change_free_bump_available: meta.change_free_bump_available,
        change_free_max_sats: meta.change_free_max_sats,
    })
}

/// Build and sign a lab transaction using BDK's add_foreign_utxo (`apply_change_free_bump` for second-pass UX).
pub fn prepare_build_and_sign_lab_transaction(
    wallet: &mut bdk_wallet::Wallet,
    utxos_json: &str,
    to_address_str: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address_str: &str,
    apply_change_free_bump: bool,
) -> Result<LabPrepareSendOutcome, CryptoError> {
    let (utxos, to_address, change_address, satisfaction_weight, fee_rate) =
        resolve_lab_send_inputs(
            wallet,
            utxos_json,
            to_address_str,
            change_address_str,
            amount_sats,
            fee_rate_sat_per_vb,
        )?;

    let total_in: u64 = utxos.iter().map(|u| u.amount_sats).sum();

    let (mut psbt, meta) = prepare_lab_psbt_inner(
        wallet,
        &utxos,
        amount_sats,
        &to_address,
        &change_address,
        satisfaction_weight,
        fee_rate,
        apply_change_free_bump,
    )?;

    // BDK wallet.sign(SignOptions) is deprecated; required until BDK provides replacement.
    #[allow(deprecated)]
    let signed = wallet
        .sign(
            &mut psbt,
            SignOptions {
                trust_witness_utxo: true,
                ..SignOptions::default()
            },
        )
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;
    if !signed {
        return Err(CryptoError::Transaction(
            "Wallet did not sign all inputs".to_string(),
        ));
    }

    let tx = transaction::extract_transaction(psbt)?;

    let total_out: u64 = tx.output.iter().map(|o| o.value.to_sat()).sum();
    let fee_sats = total_in.saturating_sub(total_out);

    let has_change = tx
        .output
        .iter()
        .any(|o| o.script_pubkey == change_address.script_pubkey());

    let signed_tx_hex = hex::encode(bitcoin::consensus::encode::serialize(&tx));

    Ok(LabPrepareSendOutcome {
        signed_tx_hex,
        fee_sats,
        has_change,
        final_amount_sats: meta.final_amount_sats,
        original_amount_sats: meta.original_amount_sats,
        raised_to_min_dust: meta.raised_to_min_dust,
        bumped_change_free: meta.bumped_change_free,
        change_free_bump_available: meta.change_free_bump_available,
        change_free_max_sats: meta.change_free_max_sats,
    })
}

/// Build and sign a lab transaction using BDK's add_foreign_utxo (legacy shape without UX fields).
pub fn build_and_sign_lab_transaction(
    wallet: &mut bdk_wallet::Wallet,
    utxos_json: &str,
    to_address_str: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address_str: &str,
) -> Result<LabSignedTransactionResult, CryptoError> {
    let out = prepare_build_and_sign_lab_transaction(
        wallet,
        utxos_json,
        to_address_str,
        amount_sats,
        fee_rate_sat_per_vb,
        change_address_str,
        false,
    )?;
    let tx_bytes =
        hex::decode(&out.signed_tx_hex).map_err(|e| CryptoError::Transaction(e.to_string()))?;
    Ok(LabSignedTransactionResult {
        signed_tx_bytes: tx_bytes,
        fee_sats: out.fee_sats,
        has_change: out.has_change,
    })
}
