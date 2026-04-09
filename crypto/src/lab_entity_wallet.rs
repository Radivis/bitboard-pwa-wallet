//! Ephemeral BDK wallets for lab entities (no thread-local ACTIVE_WALLET).
//! Used for regtest simulation; secrets are not treated as sensitive.

use bdk_wallet::chain::Merge;
use bdk_wallet::{ChangeSet, KeychainKind, Wallet};

use crate::descriptors;
use crate::error::CryptoError;
use crate::lab_psbt;
use crate::types::{AddressType, BitcoinNetwork, CreateWalletResult};
use crate::wallet::{
    create_wallet, deserialize_changeset, get_current_address, get_new_address, load_wallet,
    serialize_changeset,
};

fn open_lab_entity_wallet(
    mnemonic: &str,
    changeset_json: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<(Wallet, ChangeSet), CryptoError> {
    let pair = descriptors::derive_descriptors(mnemonic, network, address_type, account_id)?;

    let trimmed = changeset_json.trim();
    if trimmed.is_empty() || trimmed == "{}" {
        let mut w = create_wallet(&pair.external, &pair.internal, network)?;
        let staged = w.take_staged().ok_or_else(|| {
            CryptoError::Wallet("new lab entity wallet has no staged changeset".to_string())
        })?;
        return Ok((w, staged));
    }

    let cs = deserialize_changeset(changeset_json)?;
    let w = load_wallet(&pair.external, &pair.internal, network, cs.clone())?;
    Ok((w, cs))
}

fn merge_staged(wallet: &mut Wallet, persisted: &mut ChangeSet) -> Result<(), CryptoError> {
    if let Some(delta) = wallet.take_staged() {
        persisted.merge(delta);
    }
    Ok(())
}

/// Create a new lab-entity wallet from mnemonic; does not touch ACTIVE_WALLET.
pub fn create_lab_entity_wallet(
    mnemonic: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<CreateWalletResult, CryptoError> {
    let pair = descriptors::derive_descriptors(mnemonic, network, address_type, account_id)?;

    let mut w = create_wallet(&pair.external, &pair.internal, network)?;
    let first_address = get_new_address(&mut w);
    let initial_changeset = w.take_staged().ok_or_else(|| {
        CryptoError::Wallet("new lab entity wallet has no staged changeset".to_string())
    })?;

    let changeset_json = serialize_changeset(&initial_changeset)?;

    Ok(CreateWalletResult {
        external_descriptor: pair.external,
        internal_descriptor: pair.internal,
        first_address,
        changeset_json,
    })
}

/// Current external receive address (last revealed), for mining coinbase targets.
pub fn lab_entity_get_current_external_address(
    mnemonic: &str,
    changeset_json: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<String, CryptoError> {
    let (w, _) =
        open_lab_entity_wallet(mnemonic, changeset_json, network, address_type, account_id)?;
    Ok(get_current_address(&w))
}

/// Reveal the next external address and return updated changeset (e.g. explicit new receive).
pub fn lab_entity_reveal_next_external_address(
    mnemonic: &str,
    changeset_json: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<(String, String), CryptoError> {
    let (mut w, mut persisted) =
        open_lab_entity_wallet(mnemonic, changeset_json, network, address_type, account_id)?;
    let address = get_new_address(&mut w);
    merge_staged(&mut w, &mut persisted)?;
    let changeset_json = serialize_changeset(&persisted)?;
    Ok((address, changeset_json))
}

#[derive(Debug, serde::Serialize)]
pub struct LabEntitySignResult {
    pub signed_tx_hex: String,
    pub fee_sats: u64,
    pub has_change: bool,
    pub changeset_json: String,
    /// Internal change address used in the transaction (empty if no change).
    pub change_address: String,
}

/// Inputs for [`lab_entity_build_and_sign_lab_transaction`].
#[derive(Debug)]
pub struct LabEntityBuildSignArgs<'a> {
    pub mnemonic: &'a str,
    pub changeset_json: &'a str,
    pub network: BitcoinNetwork,
    pub address_type: AddressType,
    pub account_id: u32,
    pub utxos_json: &'a str,
    pub to_address: &'a str,
    pub amount_sats: u64,
    pub fee_rate_sat_per_vb: f64,
}

/// Build and sign a lab tx using a lab-entity wallet (foreign UTXOs + internal change).
pub fn lab_entity_build_and_sign_lab_transaction(
    args: LabEntityBuildSignArgs<'_>,
) -> Result<LabEntitySignResult, CryptoError> {
    let (mut w, mut persisted) = open_lab_entity_wallet(
        args.mnemonic,
        args.changeset_json,
        args.network,
        args.address_type,
        args.account_id,
    )?;

    let change_addr = w
        .reveal_next_address(KeychainKind::Internal)
        .address
        .to_string();
    merge_staged(&mut w, &mut persisted)?;

    let signed = lab_psbt::build_and_sign_lab_transaction(
        &mut w,
        args.utxos_json,
        args.to_address,
        args.amount_sats,
        args.fee_rate_sat_per_vb,
        &change_addr,
    )?;
    merge_staged(&mut w, &mut persisted)?;

    let signed_tx_hex = hex::encode(&signed.signed_tx_bytes);
    let changeset_json = serialize_changeset(&persisted)?;

    Ok(LabEntitySignResult {
        signed_tx_hex,
        fee_sats: signed.fee_sats,
        has_change: signed.has_change,
        changeset_json,
        change_address: if signed.has_change {
            change_addr
        } else {
            String::new()
        },
    })
}
