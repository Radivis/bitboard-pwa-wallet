use bdk_wallet::chain::ChainPosition;
use bdk_wallet::{ChangeSet, KeychainKind, Wallet};

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
        .map_err(|e| CryptoError::Wallet(e.to_string()))
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
        .map_err(|e| CryptoError::Wallet(e.to_string()))?
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
