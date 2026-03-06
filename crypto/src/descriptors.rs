use bdk_wallet::KeychainKind;
use bdk_wallet::bitcoin::Network;
use bdk_wallet::bitcoin::bip32::Xpriv;
use bdk_wallet::descriptor::template::{Bip84, Bip86, DescriptorTemplate};
use bdk_wallet::keys::bip39::{Language, Mnemonic};

use crate::error::CryptoError;
use crate::types::{AddressType, BitcoinNetwork, DescriptorPair};

/// Derive a pair of descriptors (external + internal) from a BIP39 mnemonic.
///
/// - For `AddressType::Taproot`: uses BIP86 template `tr(key/86'/{0,1}'/0'/{0,1}/*)`
/// - For `AddressType::Segwit`: uses BIP84 template `wpkh(key/84'/{0,1}'/0'/{0,1}/*)`
///
/// The returned descriptor strings include private key material (xprv/tprv),
/// which is required for signing transactions.
pub fn derive_descriptors(
    mnemonic_str: &str,
    network: BitcoinNetwork,
    address_type: AddressType,
) -> Result<DescriptorPair, CryptoError> {
    let mnemonic = Mnemonic::parse_in(Language::English, mnemonic_str)
        .map_err(|e| CryptoError::Mnemonic(e.to_string()))?;

    let seed = mnemonic.to_seed("");
    let bitcoin_network: Network = network.into();
    let xpriv = Xpriv::new_master(bitcoin_network, &seed)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;

    let (external_desc, internal_desc) = match address_type {
        AddressType::Taproot => build_descriptors_bip86(xpriv, bitcoin_network)?,
        AddressType::Segwit => build_descriptors_bip84(xpriv, bitcoin_network)?,
    };

    Ok(DescriptorPair {
        external: external_desc,
        internal: internal_desc,
    })
}

/// Build BIP86 (Taproot) descriptor pair.
fn build_descriptors_bip86(
    xpriv: Xpriv,
    network: Network,
) -> Result<(String, String), CryptoError> {
    let (ext_desc, ext_km, _) = Bip86(xpriv, KeychainKind::External)
        .build(network)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;
    let (int_desc, int_km, _) = Bip86(xpriv, KeychainKind::Internal)
        .build(network)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;
    Ok((
        ext_desc.to_string_with_secret(&ext_km),
        int_desc.to_string_with_secret(&int_km),
    ))
}

/// Build BIP84 (SegWit v0) descriptor pair.
fn build_descriptors_bip84(
    xpriv: Xpriv,
    network: Network,
) -> Result<(String, String), CryptoError> {
    let (ext_desc, ext_km, _) = Bip84(xpriv, KeychainKind::External)
        .build(network)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;
    let (int_desc, int_km, _) = Bip84(xpriv, KeychainKind::Internal)
        .build(network)
        .map_err(|e| CryptoError::Descriptor(e.to_string()))?;
    Ok((
        ext_desc.to_string_with_secret(&ext_km),
        int_desc.to_string_with_secret(&int_km),
    ))
}
