#![cfg(not(target_arch = "wasm32"))]

mod common;

use bitboard_crypto::descriptors;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use common::wallet_fixtures::{TEST_MNEMONIC_12, TEST_MNEMONIC_24};
use rstest::rstest;

// --- Descriptor type tests ---

#[rstest]
#[case(AddressType::Taproot, "tr(")]
#[case(AddressType::Segwit, "wpkh(")]
fn derive_descriptors_produces_correct_type(
    #[case] address_type: AddressType,
    #[case] expected_prefix: &str,
) {
    let pair =
        descriptors::derive_descriptors(TEST_MNEMONIC_12, BitcoinNetwork::Signet, address_type)
            .unwrap();
    assert!(
        pair.external.starts_with(expected_prefix),
        "External descriptor '{}' should start with '{}'",
        pair.external,
        expected_prefix,
    );
    assert!(
        pair.internal.starts_with(expected_prefix),
        "Internal descriptor '{}' should start with '{}'",
        pair.internal,
        expected_prefix,
    );
}

// --- Network tests ---

#[rstest]
#[case(BitcoinNetwork::Bitcoin)]
#[case(BitcoinNetwork::Testnet)]
#[case(BitcoinNetwork::Signet)]
#[case(BitcoinNetwork::Regtest)]
fn derive_descriptors_works_for_all_networks(#[case] network: BitcoinNetwork) {
    let pair =
        descriptors::derive_descriptors(TEST_MNEMONIC_12, network, AddressType::Taproot).unwrap();
    assert!(!pair.external.is_empty());
    assert!(!pair.internal.is_empty());
}

// --- Determinism tests ---

#[test]
fn same_mnemonic_produces_same_descriptors() {
    let pair1 = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    let pair2 = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    assert_eq!(pair1, pair2);
}

#[test]
fn different_mnemonics_produce_different_descriptors() {
    let pair1 = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    let pair2 = descriptors::derive_descriptors(
        TEST_MNEMONIC_24,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    assert_ne!(pair1, pair2);
}

#[test]
fn different_address_types_produce_different_descriptors() {
    let taproot = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    let segwit = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Segwit,
    )
    .unwrap();
    assert_ne!(taproot, segwit);
}

#[test]
fn different_networks_produce_different_descriptors() {
    let mainnet = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Bitcoin,
        AddressType::Taproot,
    )
    .unwrap();
    let signet = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    assert_ne!(mainnet, signet);
}

// --- Descriptor structure tests ---

#[test]
fn external_and_internal_descriptors_are_different() {
    let pair = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    assert_ne!(
        pair.external, pair.internal,
        "External and internal descriptors must differ"
    );
}

#[test]
fn descriptors_contain_wildcard_derivation() {
    let pair = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    assert!(
        pair.external.contains("/*"),
        "External descriptor should contain wildcard derivation path"
    );
    assert!(
        pair.internal.contains("/*"),
        "Internal descriptor should contain wildcard derivation path"
    );
}

// --- 24-word mnemonic tests ---

#[rstest]
#[case(AddressType::Taproot)]
#[case(AddressType::Segwit)]
fn derive_descriptors_works_with_24_word_mnemonic(#[case] address_type: AddressType) {
    let pair =
        descriptors::derive_descriptors(TEST_MNEMONIC_24, BitcoinNetwork::Signet, address_type)
            .unwrap();
    assert!(!pair.external.is_empty());
    assert!(!pair.internal.is_empty());
}

// --- Error case tests ---

#[test]
fn derive_descriptors_rejects_invalid_mnemonic() {
    let result = descriptors::derive_descriptors(
        "invalid mnemonic words here that are definitely not valid bip39",
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    );
    assert!(result.is_err());
}

#[test]
fn derive_descriptors_rejects_empty_mnemonic() {
    let result = descriptors::derive_descriptors("", BitcoinNetwork::Signet, AddressType::Taproot);
    assert!(result.is_err());
}

// --- Descriptor contains private key material (for signing) ---

#[test]
fn descriptors_contain_private_key_material() {
    let pair = descriptors::derive_descriptors(
        TEST_MNEMONIC_12,
        BitcoinNetwork::Signet,
        AddressType::Taproot,
    )
    .unwrap();
    // BDK descriptor templates with Xpriv include the private key
    // in the descriptor string (tprv... for testnet/signet, xprv... for mainnet)
    let has_private_key = pair.external.contains("prv") || pair.external.contains("tprv");
    assert!(
        has_private_key,
        "External descriptor should contain private key material for signing capability"
    );
}
