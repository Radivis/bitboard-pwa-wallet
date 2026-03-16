use bdk_wallet::bitcoin::Network;
use bdk_wallet::bitcoin::bip32::Xpriv;
use bdk_wallet::keys::bip39::{Language, Mnemonic};

use crate::error::CryptoError;
use crate::types::{AddressType, BitcoinNetwork, DescriptorPair};

/// BIP32 coin type: 0 for mainnet, 1 for testnet/signet/regtest.
const COIN_TYPE_MAINNET: u32 = 0;
const COIN_TYPE_TESTNET: u32 = 1;

/// Derive a pair of descriptors (external + internal) from a BIP39 mnemonic.
///
/// - For `AddressType::Taproot`: BIP86 path `tr(xprv/86'/{coin}'/account'/{0,1}/*)`
/// - For `AddressType::Segwit`: BIP84 path `wpkh(xprv/84'/{coin}'/account'/{0,1}/*)`
///
/// The returned descriptor strings include private key material (xprv/tprv),
/// which is required for signing transactions.
pub fn derive_descriptors(
    mnemonic_str: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
    account_id: u32,
) -> Result<DescriptorPair, CryptoError> {
    let mnemonic = Mnemonic::parse_in(Language::English, mnemonic_str)
        .map_err(|e| CryptoError::Mnemonic(e.to_string()))?;

    let seed = mnemonic.to_seed("");
    let bitcoin_network: Network = network.into();
    let xpriv = Xpriv::new_master(bitcoin_network, &seed)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;

    let coin_type = if bitcoin_network == Network::Bitcoin {
        COIN_TYPE_MAINNET
    } else {
        COIN_TYPE_TESTNET
    };

    let (purpose, wrapper) = match address_type {
        AddressType::Taproot => (86, "tr"),
        AddressType::Segwit => (84, "wpkh"),
    };

    Ok(DescriptorPair {
        external: format!("{wrapper}({xpriv}/{purpose}'/{coin_type}'/{account_id}'/0/*)"),
        internal: format!("{wrapper}({xpriv}/{purpose}'/{coin_type}'/{account_id}'/1/*)"),
    })
}
