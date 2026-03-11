use std::str::FromStr;

use bdk_wallet::chain::ChainPosition;
use bdk_wallet::{ChangeSet, KeychainKind, Wallet};
use bitcoin::bip32::{DerivationPath, Xpriv};
use bitcoin::key::PrivateKey;
use bitcoin::secp256k1::Secp256k1;

use crate::error::CryptoError;
use crate::types::{BalanceInfo, BitcoinNetwork, TransactionDetails};

/// Create a new BDK wallet from external and internal descriptor strings.
///
/// Returns the `Wallet` instance. Callers should immediately call
/// `wallet.take_staged()` to obtain the initial `ChangeSet` for persistence.
pub fn create_wallet(
    external_descriptor: &str,
    internal_descriptor: &str,
    network: BitcoinNetwork,
) -> Result<Wallet, CryptoError> {
    let external = external_descriptor.to_string();
    let internal = internal_descriptor.to_string();
    Wallet::create(external, internal)
        .network(network.into())
        .create_wallet_no_persist()
        .map_err(|e| CryptoError::Wallet(format!("{:?}", e)))
}

/// Reload a previously persisted wallet from its descriptors and a `ChangeSet`.
///
/// The descriptors must include private key material (xprv/tprv) for signing.
/// The `ChangeSet` is deserialized from JSON via `deserialize_changeset`.
pub fn load_wallet(
    external_descriptor: &str,
    internal_descriptor: &str,
    network: BitcoinNetwork,
    changeset: ChangeSet,
) -> Result<Wallet, CryptoError> {
    let external = external_descriptor.to_string();
    let internal = internal_descriptor.to_string();
    Wallet::load()
        .descriptor(KeychainKind::External, Some(external))
        .descriptor(KeychainKind::Internal, Some(internal))
        .extract_keys()
        .check_network(network.into())
        .load_wallet_no_persist(changeset)
        .map_err(|e| CryptoError::Wallet(format!("{:?}", e)))?
        .ok_or_else(|| CryptoError::Wallet("Wallet could not be loaded from changeset".to_string()))
}

/// Reveal the next unused external address and return it as a string.
pub fn get_new_address(wallet: &mut Wallet) -> String {
    wallet
        .reveal_next_address(KeychainKind::External)
        .address
        .to_string()
}

/// Return the last revealed external address without incrementing the index.
/// Use this when switching descriptor wallets to avoid burning address indices.
pub fn get_current_address(wallet: &Wallet) -> String {
    let index = wallet.derivation_index(KeychainKind::External).unwrap_or(0);
    wallet
        .peek_address(KeychainKind::External, index)
        .address
        .to_string()
}

/// Derive the WIF for the current external address from the descriptor.
/// Only valid for P2WPKH (wpkh) descriptors. Returns error for taproot (tr).
/// Used for lab mode where we need to sign with the regtest worker.
pub fn get_current_address_wif(
    wallet: &Wallet,
    external_descriptor: &str,
) -> Result<String, CryptoError> {
    let index = wallet.derivation_index(KeychainKind::External).unwrap_or(0);

    let (xpriv_str, path_from_key) = parse_descriptor_key_and_path(external_descriptor)?;
    let xpriv = Xpriv::from_str(xpriv_str)
        .map_err(|e| CryptoError::Descriptor(format!("Invalid extended key: {}", e)))?;

    let path_str = format!("{}/{}", path_from_key, index);
    let deriv_path = DerivationPath::from_str(&path_str)
        .map_err(|e| CryptoError::Descriptor(format!("Invalid derivation path: {}", e)))?;

    let secp = Secp256k1::new();
    let derived = xpriv
        .derive_priv(&secp, &deriv_path)
        .map_err(|e| CryptoError::Descriptor(format!("Derivation failed: {}", e)))?;

    let privkey = PrivateKey::new(derived.private_key, bitcoin::Network::Regtest);
    Ok(privkey.to_wif())
}

/// Parse descriptor to extract extended key and path. Supports wpkh(xprv/path/*) and tr(xprv/path/*).
fn parse_descriptor_key_and_path(descriptor: &str) -> Result<(&str, &str), CryptoError> {
    let inner = descriptor
        .strip_prefix("wpkh(")
        .or_else(|| descriptor.strip_prefix("tr("))
        .and_then(|s| s.strip_suffix("/*)"))
        .ok_or_else(|| {
            CryptoError::Descriptor("Descriptor must be wpkh or tr with wildcard".into())
        })?;

    let slash_pos = inner
        .find('/')
        .ok_or_else(|| CryptoError::Descriptor("Descriptor key path must contain /".into()))?;

    let (key_part, path_part) = inner.split_at(slash_pos);
    let path = path_part.strip_prefix('/').unwrap_or(path_part);

    let key = if let Some(bracket_end) = key_part.find(']') {
        key_part
            .get(bracket_end + 1..)
            .ok_or_else(|| CryptoError::Descriptor("Invalid origin in descriptor".into()))?
    } else {
        key_part
    };

    if !key.starts_with("xprv") && !key.starts_with("tprv") {
        return Err(CryptoError::Descriptor(
            "Descriptor must contain xprv or tprv for lab WIF export".into(),
        ));
    }

    Ok((key, path))
}

/// Return the current wallet balance broken down by confirmation status.
pub fn get_balance(wallet: &Wallet) -> BalanceInfo {
    let balance = wallet.balance();
    BalanceInfo {
        confirmed: balance.confirmed.to_sat(),
        trusted_pending: balance.trusted_pending.to_sat(),
        untrusted_pending: balance.untrusted_pending.to_sat(),
        immature: balance.immature.to_sat(),
        total: balance.total().to_sat(),
    }
}

/// Serialize a `ChangeSet` to a JSON string for persistence.
pub fn serialize_changeset(changeset: &ChangeSet) -> Result<String, CryptoError> {
    serde_json::to_string(changeset).map_err(Into::into)
}

/// Deserialize a `ChangeSet` from a JSON string.
pub fn deserialize_changeset(json: &str) -> Result<ChangeSet, CryptoError> {
    serde_json::from_str(json).map_err(Into::into)
}

/// Return a list of all relevant wallet transactions with summary details.
pub fn get_transaction_list(wallet: &Wallet) -> Vec<TransactionDetails> {
    wallet
        .transactions()
        .map(|wallet_tx| {
            let tx = &wallet_tx.tx_node.tx;
            let txid = tx.compute_txid();
            let (sent, received) = wallet.sent_and_received(tx);
            let fee = wallet.calculate_fee(tx).ok();

            let (is_confirmed, confirmation_block_height, confirmation_time) =
                match &wallet_tx.chain_position {
                    ChainPosition::Confirmed { anchor, .. } => (
                        true,
                        Some(anchor.block_id.height),
                        Some(anchor.confirmation_time),
                    ),
                    ChainPosition::Unconfirmed { .. } => (false, None, None),
                };

            TransactionDetails {
                txid: txid.to_string(),
                sent_sats: sent.to_sat(),
                received_sats: received.to_sat(),
                fee_sats: fee.map(|f| f.to_sat()),
                confirmation_block_height,
                confirmation_time,
                is_confirmed,
            }
        })
        .collect()
}
