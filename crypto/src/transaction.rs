use std::str::FromStr;

use bdk_wallet::Wallet;
use bitcoin::{Address, Amount, FeeRate, Network, Psbt, Transaction};

use crate::error::CryptoError;

pub fn build_transaction(
    wallet: &mut Wallet,
    recipient_address: &str,
    amount_sats: u64,
    fee_rate_sat_per_vb: f64,
    network: Network,
) -> Result<Psbt, CryptoError> {
    if amount_sats == 0 {
        return Err(CryptoError::Transaction(
            "Amount must be greater than zero".to_string(),
        ));
    }

    let address = Address::from_str(recipient_address)?
        .require_network(network)
        .map_err(|e| CryptoError::Transaction(e.to_string()))?;

    let script_pubkey = address.script_pubkey();
    let fee_rate = FeeRate::from_sat_per_vb_unchecked(fee_rate_sat_per_vb.ceil() as u64);

    let mut tx_builder = wallet.build_tx();
    tx_builder
        .add_recipient(script_pubkey, Amount::from_sat(amount_sats))
        .fee_rate(fee_rate);
    let psbt = tx_builder.finish()?;

    Ok(psbt)
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
