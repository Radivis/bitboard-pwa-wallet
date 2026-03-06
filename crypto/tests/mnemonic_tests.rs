#![cfg(not(target_arch = "wasm32"))]

mod common;

use bitboard_crypto::mnemonic;
use common::wallet_fixtures::{TEST_MNEMONIC_12, TEST_MNEMONIC_24};
use rstest::rstest;

// --- Generation tests ---

#[rstest]
#[case(12)]
#[case(24)]
fn generate_mnemonic_returns_correct_word_count(#[case] word_count: u32) {
    let mnemonic_str = mnemonic::generate_mnemonic(word_count).unwrap();
    let words: Vec<&str> = mnemonic_str.split_whitespace().collect();
    assert_eq!(words.len(), word_count as usize);
}

#[rstest]
#[case(12)]
#[case(24)]
fn generated_mnemonic_passes_validation(#[case] word_count: u32) {
    let mnemonic_str = mnemonic::generate_mnemonic(word_count).unwrap();
    assert!(mnemonic::validate_mnemonic(&mnemonic_str).is_ok());
}

#[rstest]
#[case(15)]
#[case(18)]
#[case(21)]
fn unsupported_word_count_returns_error(#[case] word_count: u32) {
    let result = mnemonic::generate_mnemonic(word_count);
    assert!(result.is_err());
}

#[test]
fn generate_mnemonic_zero_word_count_returns_error() {
    let result = mnemonic::generate_mnemonic(0);
    assert!(result.is_err());
}

#[test]
fn generate_mnemonic_invalid_word_count_returns_error() {
    let result = mnemonic::generate_mnemonic(13);
    assert!(result.is_err());
}

// --- Validation tests ---

#[test]
fn known_test_vector_12_word_mnemonic_is_valid() {
    assert!(mnemonic::validate_mnemonic(TEST_MNEMONIC_12).is_ok());
}

#[test]
fn known_test_vector_24_word_mnemonic_is_valid() {
    assert!(mnemonic::validate_mnemonic(TEST_MNEMONIC_24).is_ok());
}

#[test]
fn invalid_mnemonic_wrong_words_fails_validation() {
    let invalid = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon wrong";
    assert!(mnemonic::validate_mnemonic(invalid).is_err());
}

#[test]
fn invalid_mnemonic_too_few_words_fails_validation() {
    let too_short = "abandon abandon abandon";
    assert!(mnemonic::validate_mnemonic(too_short).is_err());
}

#[test]
fn invalid_mnemonic_empty_string_fails_validation() {
    assert!(mnemonic::validate_mnemonic("").is_err());
}

#[test]
fn invalid_mnemonic_nonsense_fails_validation() {
    let nonsense = "foo bar baz qux quux corge grault garply waldo fred plugh xyzzy";
    assert!(mnemonic::validate_mnemonic(nonsense).is_err());
}

// --- Entropy / determinism tests ---

#[test]
fn two_generated_mnemonics_are_different() {
    let m1 = mnemonic::generate_mnemonic(12).unwrap();
    let m2 = mnemonic::generate_mnemonic(12).unwrap();
    assert_ne!(
        m1, m2,
        "Two independently generated mnemonics should differ"
    );
}

#[test]
fn all_generated_words_are_from_bip39_english_wordlist() {
    let mnemonic_str = mnemonic::generate_mnemonic(24).unwrap();
    // Validation implicitly checks this, but let's be explicit:
    // if all words are valid BIP39 English words AND checksum passes,
    // validate_mnemonic succeeds.
    assert!(mnemonic::validate_mnemonic(&mnemonic_str).is_ok());
}
