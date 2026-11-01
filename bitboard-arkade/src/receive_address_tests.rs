use std::str::FromStr;

use ark_client::key_provider::{
    Bip32KeyProvider, DiscoverableKeyProvider, KeyProvider, KeypairIndex,
    display_receive_derivation_index,
};
use bitcoin::Network;
use bitcoin::bip32::{DerivationPath, Xpriv};

fn test_bip32_key_provider() -> Bip32KeyProvider {
    test_bip32_key_provider_at_next_index(0)
}

fn test_bip32_key_provider_at_next_index(start_index: u32) -> Bip32KeyProvider {
    let seed = [7u8; 32];
    let xpriv = Xpriv::new_master(Network::Signet, &seed).expect("master key");
    let base_path = DerivationPath::from_str("m/84'/0'/0'/0").expect("path");
    Bip32KeyProvider::new_with_index(xpriv, base_path, start_index)
}

#[test]
fn display_receive_derivation_index_maps_next_index() {
    assert_eq!(display_receive_derivation_index(0), 0);
    assert_eq!(display_receive_derivation_index(1), 0);
    assert_eq!(display_receive_derivation_index(2), 1);
}

#[test]
fn peek_offchain_receive_does_not_increment_next_index() {
    let provider = test_bip32_key_provider();
    assert_eq!(
        provider.peek_next_derivation_index().expect("peek"),
        Some(0)
    );

    let first = provider
        .ensure_keypair_cached_at_index(0)
        .expect("cache index 0");
    assert_eq!(
        provider.peek_next_derivation_index().expect("peek"),
        Some(0)
    );

    let second = provider
        .ensure_keypair_cached_at_index(0)
        .expect("cache index 0 again");
    assert_eq!(first.x_only_public_key(), second.x_only_public_key());
}

#[test]
fn reveal_next_offchain_receive_increments_next_index_once() {
    let provider = test_bip32_key_provider();
    provider
        .get_next_keypair(KeypairIndex::New)
        .expect("first reveal");
    assert_eq!(
        provider.peek_next_derivation_index().expect("peek"),
        Some(1)
    );
    provider
        .get_next_keypair(KeypairIndex::New)
        .expect("second reveal");
    assert_eq!(
        provider.peek_next_derivation_index().expect("peek"),
        Some(2)
    );
}

#[test]
fn peek_unchanged_after_mark_as_used() {
    let provider = test_bip32_key_provider();
    let revealed = provider
        .get_next_keypair(KeypairIndex::New)
        .expect("reveal");
    let revealed_pk = revealed.x_only_public_key().0;

    provider.mark_as_used(&revealed_pk).expect("mark used");

    let peeked = provider
        .ensure_keypair_cached_at_index(display_receive_derivation_index(1))
        .expect("peek display index");
    assert_eq!(peeked.x_only_public_key().0, revealed_pk);

    let last_unused = provider
        .get_next_keypair(KeypairIndex::LastUnused)
        .expect("current receive key");
    assert_eq!(last_unused.x_only_public_key().0, revealed_pk);
    assert_eq!(
        provider
            .peek_next_derivation_index_value()
            .expect("cursor unchanged"),
        1
    );
}

/// Session reopen hydrates the baseline contract key before `LastUnused`. That key is the current
/// receive key and must not be treated as used.
#[test]
fn hydrated_current_receive_key_is_last_unused_without_advancing() {
    let provider = test_bip32_key_provider_at_next_index(1);
    provider
        .cache_keypair_at_index(0)
        .expect("hydrate current receive key");
    let restored = provider
        .get_next_keypair(KeypairIndex::LastUnused)
        .expect("last unused");
    let expected = provider.ensure_keypair_cached_at_index(0).expect("index 0");
    assert_eq!(restored.x_only_public_key(), expected.x_only_public_key());
    assert_eq!(
        provider
            .peek_next_derivation_index_value()
            .expect("cursor unchanged"),
        1
    );
}

/// Cold provider: persisted `next_index` with an empty cache must return the current receive
/// key and must not advance the cursor. That is what session open does via `LastUnused`.
#[test]
fn last_unused_restores_persisted_receive_key_without_advancing() {
    let provider = test_bip32_key_provider_at_next_index(1);
    let restored = provider
        .get_next_keypair(KeypairIndex::LastUnused)
        .expect("restore current receive key");
    let expected = provider.ensure_keypair_cached_at_index(0).expect("index 0");
    assert_eq!(restored.x_only_public_key(), expected.x_only_public_key());
    assert_eq!(
        provider
            .peek_next_derivation_index_value()
            .expect("cursor unchanged"),
        1
    );

    let again = provider
        .get_next_keypair(KeypairIndex::LastUnused)
        .expect("second lookup");
    assert_eq!(again.x_only_public_key(), restored.x_only_public_key());
}

/// Simulates reveal → export `offchain_next_derivation_index` → reopen → peek display key.
#[test]
fn reveal_export_reopen_peek_roundtrip_preserves_revealed_key() {
    for start_index in [0_u32, 1] {
        let provider = test_bip32_key_provider_at_next_index(start_index);
        let revealed = provider
            .get_next_keypair(KeypairIndex::New)
            .expect("reveal next receive key");
        let exported_next_index = provider
            .peek_next_derivation_index_value()
            .expect("export next index");

        let reopened = test_bip32_key_provider_at_next_index(exported_next_index);
        let peek_display_index = display_receive_derivation_index(exported_next_index);
        let peeked = reopened
            .ensure_keypair_cached_at_index(peek_display_index)
            .expect("peek after reopen");

        assert_eq!(
            peeked.x_only_public_key(),
            revealed.x_only_public_key(),
            "start_index={start_index} exported_next_index={exported_next_index}"
        );
    }
}
