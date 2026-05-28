#![cfg(not(target_arch = "wasm32"))]

mod common;

use bdk_wallet::ChangeSet;
use bdk_wallet::chain::Merge;
use bitboard_crypto::types::{AddressType, BitcoinNetwork};
use bitboard_crypto::wallet;
use bitboard_crypto::wallet_session::{WalletSession, open_wallet_from_descriptors};
use common::wallet_fixtures::{
    DEFAULT_ADDRESS_TYPE, DEFAULT_NETWORK, create_test_wallet, descriptors_for_test,
};

#[test]
fn open_wallet_session_loads_changeset_and_reports_balance() {
    let pair = descriptors_for_test(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let changeset = wallet.take_staged().expect("initial changeset");
    let changeset_json = wallet::serialize_changeset(&changeset).expect("serialize");

    let session = WalletSession::open(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        DEFAULT_NETWORK,
        &changeset_json,
        false,
    )
    .expect("open session");

    let balance = session.get_balance();
    assert_eq!(balance.confirmed_sats, 0);
    assert_eq!(balance.total_sats, 0);
}

#[test]
fn export_changeset_includes_staged_updates() {
    let pair = descriptors_for_test(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    let mut wallet = create_test_wallet(DEFAULT_NETWORK, DEFAULT_ADDRESS_TYPE);
    wallet::get_new_address(&mut wallet);
    let changeset = wallet.take_staged().expect("staged after reveal");
    let changeset_json = wallet::serialize_changeset(&changeset).expect("serialize");

    let mut session = WalletSession::open(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        DEFAULT_NETWORK,
        &changeset_json,
        false,
    )
    .expect("open session");

    session.reveal_next_external_address();
    let exported = session.export_changeset().expect("export");

    assert_ne!(
        exported, changeset_json,
        "export after reveal should differ from input changeset"
    );
    let _: ChangeSet = serde_json::from_str(&exported).expect("valid changeset JSON");
}

#[test]
fn open_wallet_session_use_empty_chain_creates_fresh_chain() {
    let pair = descriptors_for_test(BitcoinNetwork::Bitcoin, AddressType::Taproot);
    let session = WalletSession::open(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        BitcoinNetwork::Bitcoin,
        "{}",
        true,
    )
    .expect("open with empty chain");

    let balance = session.get_balance();
    assert_eq!(balance.total_sats, 0);

    let (_, changeset) = open_wallet_from_descriptors(
        &pair.external_descriptor,
        &pair.internal_descriptor,
        BitcoinNetwork::Bitcoin,
        "{}",
        true,
    )
    .expect("open helper");
    assert!(
        !changeset.is_empty(),
        "fresh chain wallet should produce initial staged changeset"
    );
}
