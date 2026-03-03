use bitboard_crypto::types::{AddressType, BitcoinNetwork};

/// Well-known BIP39 12-word test vector (all "abandon" + "about").
/// Derived keys are publicly documented and deterministic.
pub const TEST_MNEMONIC_12: &str =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/// Well-known BIP39 24-word test vector (all "abandon" + "art").
pub const TEST_MNEMONIC_24: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

pub const DEFAULT_ADDRESS_TYPE: AddressType = AddressType::Taproot;
pub const DEFAULT_NETWORK: BitcoinNetwork = BitcoinNetwork::Signet;
