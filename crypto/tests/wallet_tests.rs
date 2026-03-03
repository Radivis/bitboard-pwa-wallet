mod common;

use bdk_wallet::KeychainKind;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitboard_crypto::wallet;
use common::wallet_fixtures::{
    create_test_wallet, descriptors_for_test, DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK,
};
use rstest::rstest;

// --- Balance tests ---

#[test]
fn get_balance_returns_zero_for_new_wallet() {
    let wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let balance = wallet::get_balance(&wallet);
    assert_eq!(balance.confirmed, 0);
    assert_eq!(balance.trusted_pending, 0);
    assert_eq!(balance.untrusted_pending, 0);
    assert_eq!(balance.immature, 0);
    assert_eq!(balance.total, 0);
}

// --- Address type tests ---

#[rstest]
#[case(AddressType::Taproot, "tb1p")]
#[case(AddressType::Segwit, "tb1q")]
fn create_wallet_generates_valid_first_address(
    #[case] address_type: AddressType,
    #[case] expected_prefix: &str,
) {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, address_type);
    let address = wallet::get_new_address(&mut wallet);
    assert!(
        address.starts_with(expected_prefix),
        "Address '{}' should start with '{}' for {:?} on {:?}",
        address,
        expected_prefix,
        address_type,
        DEFAULT_NETWORK,
    );
}

// --- Network tests ---

#[rstest]
#[case(BitcoinNetwork::Bitcoin, "bc1p")]
#[case(BitcoinNetwork::Testnet, "tb1p")]
#[case(BitcoinNetwork::Signet, "tb1p")]
#[case(BitcoinNetwork::Regtest, "bcrt1p")]
fn wallet_creation_works_for_all_networks(
    #[case] network: BitcoinNetwork,
    #[case] expected_prefix: &str,
) {
    let mut wallet = create_test_wallet(network, AddressType::Taproot);
    let address = wallet::get_new_address(&mut wallet);
    assert!(
        address.starts_with(expected_prefix),
        "Address '{}' should start with '{}' on {:?}",
        address,
        expected_prefix,
        network,
    );
}

// --- Address index tests ---

#[test]
fn get_new_address_increments_index() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let addr1 = wallet::get_new_address(&mut wallet);
    let addr2 = wallet::get_new_address(&mut wallet);
    let addr3 = wallet::get_new_address(&mut wallet);
    assert_ne!(addr1, addr2, "Consecutive addresses must differ");
    assert_ne!(addr2, addr3, "Consecutive addresses must differ");
    assert_ne!(addr1, addr3, "All three addresses must be unique");
}

// --- ChangeSet serialization tests ---

#[test]
fn create_wallet_returns_serializable_changeset() {
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);

    let changeset = wallet.take_staged();
    assert!(changeset.is_some(), "New wallet must have a staged changeset");

    let changeset = changeset.unwrap();
    let json = wallet::serialize_changeset(&changeset).expect("Changeset should serialize to JSON");
    assert!(!json.is_empty());

    let round_tripped =
        wallet::deserialize_changeset(&json).expect("JSON should deserialize back to ChangeSet");
    let json2 =
        wallet::serialize_changeset(&round_tripped).expect("Round-tripped changeset should serialize");
    assert_eq!(json, json2, "ChangeSet JSON round-trip must be lossless");
}

// --- Wallet loading tests ---

#[test]
fn load_wallet_from_changeset_restores_state() {
    let pair = descriptors_for_test(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let mut wallet = wallet::create_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK)
        .expect("Wallet creation should succeed");

    let first_address = wallet.peek_address(KeychainKind::External, 0).address.to_string();
    let changeset = wallet.take_staged().expect("Must have initial changeset");

    let loaded_wallet =
        wallet::load_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK, changeset)
            .expect("Loading wallet from changeset should succeed");

    let loaded_address = loaded_wallet
        .peek_address(KeychainKind::External, 0)
        .address
        .to_string();

    assert_eq!(
        first_address, loaded_address,
        "Loaded wallet must produce the same first address"
    );
}

#[test]
fn changeset_round_trip_preserves_address_index() {
    let pair = descriptors_for_test(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let mut wallet = wallet::create_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK)
        .expect("Wallet creation should succeed");

    wallet::get_new_address(&mut wallet);
    wallet::get_new_address(&mut wallet);
    let third_address = wallet::get_new_address(&mut wallet);

    let changeset = wallet.take_staged().expect("Must have staged changeset after revealing addresses");
    let json = wallet::serialize_changeset(&changeset).expect("Serialization should succeed");
    let deserialized = wallet::deserialize_changeset(&json).expect("Deserialization should succeed");

    let mut loaded =
        wallet::load_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK, deserialized)
            .expect("Loading should succeed");

    let next_address = wallet::get_new_address(&mut loaded);
    assert_ne!(
        next_address, third_address,
        "Loaded wallet's next address must be beyond the previously revealed ones"
    );
}

// --- Determinism tests ---

#[test]
fn same_descriptors_produce_same_wallet() {
    let pair = descriptors_for_test(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let wallet1 = wallet::create_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK)
        .expect("First wallet creation should succeed");
    let wallet2 = wallet::create_wallet(&pair.external, &pair.internal, DEFAULT_NETWORK)
        .expect("Second wallet creation should succeed");

    let addr1 = wallet1.peek_address(KeychainKind::External, 0).address.to_string();
    let addr2 = wallet2.peek_address(KeychainKind::External, 0).address.to_string();
    assert_eq!(
        addr1, addr2,
        "Same descriptors must produce the same first address"
    );
}

// --- Error case tests ---

#[test]
fn invalid_changeset_json_returns_error() {
    let result = wallet::deserialize_changeset("this is not valid json {{{");
    assert!(result.is_err(), "Garbage JSON must return an error");
}

#[test]
fn invalid_descriptor_returns_error() {
    let result = wallet::create_wallet(
        "not-a-real-descriptor",
        "also-not-a-descriptor",
        DEFAULT_NETWORK,
    );
    assert!(result.is_err(), "Invalid descriptor strings must return an error");
}
