//! Normalize pasted Bitcoin addresses before `Address::from_str`.
//!
//! rust-bitcoin reports some bech32 failures as `ParseError::LegacyAddressTooLong`,
//! whose Display text is "legacy address base58 string". Strip paste junk first.
//! Keep the stripped characters in sync with
//! `frontend/src/lib/wallet/pasted-invisible-code-points.json`.

use std::str::FromStr;

use bitcoin::{Address, Network};

use crate::error::{CryptoError, INVALID_BITCOIN_ADDRESS_MESSAGE};

/// Drop invisible paste marks and markdown backticks, then trim whitespace.
pub fn sanitize_pasted_bitcoin_text(raw: &str) -> String {
    let without_paste_junk: String = raw
        .chars()
        .filter(|character| !is_pasted_invisible_or_backtick(*character))
        .collect();
    without_paste_junk.trim().to_string()
}

fn is_pasted_invisible_or_backtick(character: char) -> bool {
    matches!(
        character,
        '\u{00AD}'
            | '\u{180E}'
            | '\u{200B}'
            | '\u{200C}'
            | '\u{200D}'
            | '\u{200E}'
            | '\u{200F}'
            | '\u{202A}'
            | '\u{202B}'
            | '\u{202C}'
            | '\u{202D}'
            | '\u{202E}'
            | '\u{2060}'
            | '\u{2066}'
            | '\u{2067}'
            | '\u{2068}'
            | '\u{2069}'
            | '\u{FEFF}'
            | '`'
    )
}

/// Parse a user-supplied address for `network`, after paste sanitization.
///
/// Unknown witness versions and non-standard program lengths decode in rust-bitcoin
/// but are not payable: `address_type()` is `None` for those outputs.
pub fn parse_bitcoin_address(raw: &str, network: Network) -> Result<Address, CryptoError> {
    let sanitized = sanitize_pasted_bitcoin_text(raw);
    let address = Address::from_str(&sanitized)?.require_network(network)?;
    if !is_standard_payable_address(&address) {
        return Err(CryptoError::Transaction(
            INVALID_BITCOIN_ADDRESS_MESSAGE.to_string(),
        ));
    }
    Ok(address)
}

fn is_standard_payable_address(address: &Address) -> bool {
    matches!(
        address.address_type(),
        Some(
            bitcoin::AddressType::P2pkh
                | bitcoin::AddressType::P2sh
                | bitcoin::AddressType::P2wpkh
                | bitcoin::AddressType::P2wsh
                | bitcoin::AddressType::P2tr
        )
    )
}

#[cfg(test)]
mod tests {
    use bitcoin::{WitnessProgram, WitnessVersion};

    use super::*;
    use crate::error::INVALID_BITCOIN_ADDRESS_MESSAGE;

    const SIGNET_P2WPKH: &str = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
    const MUTINYNET_P2TR: &str = "tb1pca7a2yt9zwxccwclzl4l0qcaep0waxnk9jg75k44fq4sfnwa2l3sdn7zh9";

    #[test]
    fn regtest_p2wpkh_vector_parses() {
        let address = "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";
        let parsed = parse_bitcoin_address(address, Network::Regtest).expect("regtest vector");
        assert_eq!(parsed.to_string(), address);
    }

    #[test]
    fn clean_signet_address_is_unchanged() {
        let parsed = parse_bitcoin_address(SIGNET_P2WPKH, Network::Signet).expect("clean parse");
        assert_eq!(parsed.to_string(), SIGNET_P2WPKH);
    }

    #[test]
    fn zero_width_space_inside_taproot_address_parses_on_signet() {
        let polluted = format!(
            "{}{}{}",
            &MUTINYNET_P2TR[..20],
            '\u{200B}',
            &MUTINYNET_P2TR[20..]
        );
        let parsed = parse_bitcoin_address(&polluted, Network::Signet).expect("polluted parse");
        let clean = parse_bitcoin_address(MUTINYNET_P2TR, Network::Signet).expect("clean parse");
        assert_eq!(parsed, clean);
    }

    #[test]
    fn non_standard_witness_program_is_rejected() {
        let short_v1 = witness_address(Network::Bitcoin, WitnessVersion::V1, &[1_u8; 20]);
        let future_version = witness_address(Network::Bitcoin, WitnessVersion::V2, &[2_u8; 32]);

        let short_v1_error =
            parse_bitcoin_address(&short_v1, Network::Bitcoin).expect_err("20-byte v1");
        let future_version_error =
            parse_bitcoin_address(&future_version, Network::Bitcoin).expect_err("witness v2");
        assert!(
            short_v1_error
                .to_string()
                .contains(INVALID_BITCOIN_ADDRESS_MESSAGE)
        );
        assert!(
            future_version_error
                .to_string()
                .contains(INVALID_BITCOIN_ADDRESS_MESSAGE)
        );
    }

    fn witness_address(network: Network, version: WitnessVersion, program: &[u8]) -> String {
        let witness_program = WitnessProgram::new(version, program).expect("witness program");
        Address::from_witness_program(witness_program, network).to_string()
    }

    #[test]
    fn pasted_invisible_characters_match_the_shared_vector() {
        use std::collections::BTreeSet;

        let fixture =
            include_str!("../../frontend/src/lib/wallet/pasted-invisible-code-points.json");
        let listed: Vec<String> = serde_json::from_str(fixture).expect("shared vector");
        let expected: BTreeSet<u32> = listed
            .iter()
            .map(|hex| u32::from_str_radix(hex, 16).expect("hex code point"))
            .collect();
        assert_eq!(
            expected.len(),
            listed.len(),
            "shared vector has a duplicate code point"
        );
        assert!(
            expected.contains(&0x202E),
            "shared vector must include a bidi override"
        );
        assert!(
            expected.contains(&0x200B),
            "shared vector must include a zero-width mark"
        );
        assert!(
            expected.contains(&0x60),
            "shared vector must include a backtick"
        );

        let stripped: BTreeSet<u32> = (0..=0x10FFFF)
            .filter_map(char::from_u32)
            .filter(|character| is_pasted_invisible_or_backtick(*character))
            .map(u32::from)
            .collect();
        assert_eq!(stripped, expected);

        let address = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
        let polluted = format!("\u{202E}{}\u{200B}{}`", &address[..4], &address[4..]);
        assert_eq!(sanitize_pasted_bitcoin_text(&polluted), address);
    }

    #[test]
    fn legacy_mainnet_addresses_parse_only_on_mainnet() {
        let pay_to_public_key_hash = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
        let pay_to_script_hash = "33iFwdLuRpW1uK1RTRqsoi8rR4NpDzk66k";
        parse_bitcoin_address(pay_to_public_key_hash, Network::Bitcoin).expect("mainnet p2pkh");
        parse_bitcoin_address(pay_to_script_hash, Network::Bitcoin).expect("mainnet p2sh");
        assert!(parse_bitcoin_address(pay_to_public_key_hash, Network::Signet).is_err());
        assert!(parse_bitcoin_address(pay_to_script_hash, Network::Regtest).is_err());
    }

    #[test]
    fn legacy_testnet_addresses_parse_on_test_kind_networks() {
        let pay_to_public_key_hash = "mqkhEMH6NCeYjFybv7pvFC22MFeaNT9AQC";
        let pay_to_script_hash = "2N3zXjbwdTcPsJiy8sUK9FhWJhqQCxA8Jjr";
        for network in [Network::Testnet, Network::Signet, Network::Regtest] {
            parse_bitcoin_address(pay_to_public_key_hash, network).expect("testnet p2pkh");
            parse_bitcoin_address(pay_to_script_hash, network).expect("testnet p2sh");
        }
        assert!(parse_bitcoin_address(pay_to_public_key_hash, Network::Bitcoin).is_err());
        assert!(parse_bitcoin_address(pay_to_script_hash, Network::Bitcoin).is_err());
    }

    #[test]
    fn junk_legacy_prefix_is_rejected() {
        assert!(parse_bitcoin_address("1", Network::Bitcoin).is_err());
        assert!(parse_bitcoin_address("1not-an-address", Network::Bitcoin).is_err());
    }

    #[test]
    fn worker_address_check_accepts_testnet_legacy_on_mutinynet() {
        assert!(crate::bitcoin_address_is_valid(
            "mqkhEMH6NCeYjFybv7pvFC22MFeaNT9AQC",
            "mutinynet",
        ));
        assert!(crate::bitcoin_address_is_valid(
            "mqkhEMH6NCeYjFybv7pvFC22MFeaNT9AQC",
            "regtest",
        ));
        assert!(!crate::bitcoin_address_is_valid(
            "mqkhEMH6NCeYjFybv7pvFC22MFeaNT9AQC",
            "bitcoin",
        ));
        assert!(!crate::bitcoin_address_is_valid("1", "bitcoin"));
        assert!(!crate::bitcoin_address_is_valid(
            "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            "not-a-network",
        ));
    }

    #[test]
    fn undecodable_bech32_does_not_mention_legacy_base58() {
        let error = parse_bitcoin_address(&format!("tb1q{}", "q".repeat(60)), Network::Signet)
            .expect_err("undecodable address");
        let message = error.to_string();
        assert!(
            message.contains(INVALID_BITCOIN_ADDRESS_MESSAGE),
            "unexpected message: {message}"
        );
        assert!(
            !message.to_lowercase().contains("legacy address"),
            "misleading legacy wording: {message}"
        );
    }
}
