//! BDK-based lab transaction build and sign.
//!
//! Uses `add_foreign_utxo` to build a PSBT from lab UTXOs (not in wallet DB),
//! then signs via the wallet's descriptor. Unifies lab and mainnet signing paths.

use std::str::FromStr;

use bdk_wallet::KeychainKind;
use bitcoin::{Address, Amount, FeeRate, Network, OutPoint, ScriptBuf, TxOut, Txid, psbt};

use crate::error::CryptoError;
use crate::lab::LabUtxoInput;
use crate::transaction;

/// Build and sign a lab transaction using BDK's add_foreign_utxo.
/// Returns (signed_tx_hex, fee_sats, has_change).
pub fn build_and_sign_lab_transaction(
    wallet: &mut bdk_wallet::Wallet,
    utxos_json: &str,
    to_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    change_address: &str,
) -> Result<(Vec<u8>, u64, bool), CryptoError> {
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

    let total_in: u64 = utxos.iter().map(|u| u.amount_sats).sum();
    if amount_sats >= total_in {
        return Err(CryptoError::Transaction(
            "Payment amount must be less than total inputs".to_string(),
        ));
    }

    let to_addr = Address::from_str(to_address)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let change_addr = Address::from_str(change_address)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?
        .require_network(Network::Regtest)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let satisfaction_weight = wallet
        .public_descriptor(KeychainKind::External)
        .max_weight_to_satisfy()
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let fee_rate = FeeRate::from_sat_per_vb_unchecked(fee_rate_sat_per_vb.ceil() as u64);

    let mut tx_builder = wallet.build_tx();
    tx_builder
        .manually_selected_only()
        .only_witness_utxo()
        .add_recipient(to_addr.script_pubkey(), Amount::from_sat(amount_sats))
        .drain_to(change_addr.script_pubkey())
        .fee_rate(fee_rate);

    for utxo in &utxos {
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

    let mut psbt = tx_builder
        .finish()
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    #[allow(deprecated)]
    let signed = {
        use bdk_wallet::SignOptions;
        wallet
            .sign(
                &mut psbt,
                SignOptions {
                    trust_witness_utxo: true,
                    ..SignOptions::default()
                },
            )
            .map_err(|e| CryptoError::Transaction(e.to_string()))?
    };
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
        .any(|o| o.script_pubkey == change_addr.script_pubkey());

    let tx_bytes = bitcoin::consensus::encode::serialize(&tx);

    Ok((tx_bytes, fee_sats, has_change))
}
