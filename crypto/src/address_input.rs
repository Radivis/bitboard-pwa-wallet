//! Normalize pasted Bitcoin addresses before `Address::from_str`.
//!
//! rust-bitcoin reports some bech32 failures as `ParseError::LegacyAddressTooLong`,
//! whose Display text is "legacy address base58 string". Strip paste junk first.
//! Keep the stripped characters in sync with
//! `frontend/src/lib/wallet/strip-pasted-invisible-characters.ts`.

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
