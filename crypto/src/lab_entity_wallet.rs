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
        let mut wallet = create_wallet(&pair.external, &pair.internal, network)?;
        let staged = wallet.take_staged().ok_or_else(|| {
            CryptoError::Wallet("new lab entity wallet has no staged changeset".to_string())
        })?;
        return Ok((wallet, staged));
    }

    let changeset = deserialize_changeset(changeset_json)?;
    let wallet = load_wallet(&pair.external, &pair.internal, network, changeset.clone())?;
    Ok((wallet, changeset))
}

fn merge_staged_changeset(
    wallet: &mut Wallet,
    persisted_changeset: &mut ChangeSet,
) -> Result<(), CryptoError> {
    if let Some(changeset_delta) = wallet.take_staged() {
        persisted_changeset.merge(changeset_delta);
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

    let mut wallet = create_wallet(&pair.external, &pair.internal, network)?;
    let first_address = get_new_address(&mut wallet);
    let initial_changeset = wallet.take_staged().ok_or_else(|| {
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
    let (wallet, _) =
        open_lab_entity_wallet(mnemonic, changeset_json, network, address_type, account_id)?;
    Ok(get_current_address(&wallet))
}

/// Reveal the next external address and return updated changeset (e.g. explicit new receive).
pub fn lab_entity_reveal_next_external_address(
    mnemonic: &str,
    changeset_json: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<(String, String), CryptoError> {
    let (mut wallet, mut persisted_changeset) =
        open_lab_entity_wallet(mnemonic, changeset_json, network, address_type, account_id)?;
    let address = get_new_address(&mut wallet);
    merge_staged_changeset(&mut wallet, &mut persisted_changeset)?;
    let changeset_json = serialize_changeset(&persisted_changeset)?;
    Ok((address, changeset_json))
}

#[derive(Debug, serde::Serialize)]
pub struct LabEntitySignResult {
    pub signed_tx_hex: String,
    pub fee_sats: u64,
    pub has_change: bool,
    pub changeset_json: String,
    /// Internal change address used in the transaction, only set when the signed tx has change.
    pub change_address: Option<String>,
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
    let (mut wallet, mut persisted_changeset) = open_lab_entity_wallet(
        args.mnemonic,
        args.changeset_json,
        args.network,
        args.address_type,
        args.account_id,
    )?;

    let next_internal_index = wallet.next_derivation_index(KeychainKind::Internal);
    let change_address_for_build = wallet
        .peek_address(KeychainKind::Internal, next_internal_index)
        .address
        .to_string();

    let signed_tx = lab_psbt::build_and_sign_lab_transaction(
        &mut wallet,
        args.utxos_json,
        args.to_address,
        args.amount_sats,
        args.fee_rate_sat_per_vb,
        &change_address_for_build,
    )?;
    merge_staged_changeset(&mut wallet, &mut persisted_changeset)?;

    let change_address = if signed_tx.has_change {
        let revealed = wallet.reveal_next_address(KeychainKind::Internal);
        merge_staged_changeset(&mut wallet, &mut persisted_changeset)?;
        let revealed_str = revealed.address.to_string();
        debug_assert_eq!(revealed_str, change_address_for_build);
        Some(revealed_str)
    } else {
        None
    };

    let signed_tx_hex = hex::encode(&signed_tx.signed_tx_bytes);
    let changeset_json = serialize_changeset(&persisted_changeset)?;

    Ok(LabEntitySignResult {
        signed_tx_hex,
        fee_sats: signed_tx.fee_sats,
        has_change: signed_tx.has_change,
        changeset_json,
        change_address,
    })
}
