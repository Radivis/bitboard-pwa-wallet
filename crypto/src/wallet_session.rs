//! Ephemeral BDK wallet sessions that do not use thread-local `ACTIVE_WALLET`.
//!
//! Used for read-only probes (e.g. mainnet balance summation) and as the migration
//! path away from implicit global wallet state. See `crypto/docs/wallet-session-migration.md`.

use bdk_wallet::chain::Merge;
use bdk_wallet::{ChangeSet, Wallet};

use crate::error::CryptoError;
use crate::types::{BalanceInfo, BitcoinNetwork};
use crate::wallet;

/// Open a wallet from descriptors and persisted changeset without touching global state.
pub fn open_wallet_from_descriptors(
    external_descriptor: &str,
    internal_descriptor: &str,
    network: BitcoinNetwork,
    changeset_json: &str,
    use_empty_chain: bool,
) -> Result<(Wallet, ChangeSet), CryptoError> {
    if use_empty_chain {
        let bdk_network = wallet::bdk_network_for_app(network);
        let mut wallet_instance = wallet::create_wallet_with_bdk_network(
            external_descriptor,
            internal_descriptor,
            bdk_network,
        )?;
        let initial_changeset = wallet_instance
            .take_staged()
            .ok_or_else(|| CryptoError::Wallet("new wallet has no staged changeset".to_string()))?;
        return Ok((wallet_instance, initial_changeset));
    }

    let changeset = wallet::deserialize_changeset(changeset_json)?;
    let wallet_instance = wallet::load_wallet(
        external_descriptor,
        internal_descriptor,
        network,
        changeset.clone(),
    )?;
    Ok((wallet_instance, changeset))
}

pub struct WalletSession {
    wallet: Wallet,
    accumulated_changeset: ChangeSet,
}

impl WalletSession {
    pub fn open(
        external_descriptor: &str,
        internal_descriptor: &str,
        network: BitcoinNetwork,
        changeset_json: &str,
        use_empty_chain: bool,
    ) -> Result<Self, CryptoError> {
        let (wallet, accumulated_changeset) = open_wallet_from_descriptors(
            external_descriptor,
            internal_descriptor,
            network,
            changeset_json,
            use_empty_chain,
        )?;
        Ok(Self {
            wallet,
            accumulated_changeset,
        })
    }

    pub fn get_balance(&self) -> BalanceInfo {
        wallet::get_balance(&self.wallet)
    }

    /// Merge any staged wallet delta into the session changeset and serialize.
    pub fn export_changeset(&mut self) -> Result<String, CryptoError> {
        if let Some(staged_changeset) = self.wallet.take_staged() {
            self.accumulated_changeset.merge(staged_changeset);
        }
        wallet::serialize_changeset(&self.accumulated_changeset)
    }

    /// Reveal the next external address (native tests and future session APIs).
    pub fn reveal_next_external_address(&mut self) -> String {
        wallet::get_new_address(&mut self.wallet)
    }
}
