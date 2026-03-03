use bdk_wallet::Wallet;
use bitboard_crypto::descriptors;
use bitboard_crypto::types::{AddressType, BitcoinNetwork, DescriptorPair};
use bitboard_crypto::wallet;

/// Well-known BIP39 12-word test vector (all "abandon" + "about").
/// Derived keys are publicly documented and deterministic.
pub const TEST_MNEMONIC_12: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/// Well-known BIP39 24-word test vector (all "abandon" + "art").
pub const TEST_MNEMONIC_24: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

pub const DEFAULT_ADDRESS_TYPE: AddressType = AddressType::Taproot;
pub const DEFAULT_NETWORK: BitcoinNetwork = BitcoinNetwork::Signet;

pub fn descriptors_for_test(network: BitcoinNetwork, address_type: AddressType) -> DescriptorPair {
    descriptors::derive_descriptors(TEST_MNEMONIC_12, network, address_type).unwrap()
}

pub fn create_test_wallet(network: BitcoinNetwork, address_type: AddressType) -> Wallet {
    let pair = descriptors_for_test(network, address_type);
    wallet::create_wallet(&pair.external, &pair.internal, network).unwrap()
}
