use bdk_wallet::keys::bip39::{Language, Mnemonic, WordCount};
use bdk_wallet::keys::GeneratableKey;
use bdk_wallet::miniscript::Tap;

use crate::error::CryptoError;

/// Generate a new BIP39 mnemonic with the given word count.
///
/// Only 12 and 24 word mnemonics are supported (per wallet spec).
/// Returns the mnemonic as a space-separated string.
pub fn generate_mnemonic(word_count: u32) -> Result<String, CryptoError> {
     let wc = match word_count {
        12 => WordCount::Words12,
        24 => WordCount::Words24,
        _ => {
            return Err(CryptoError::Mnemonic(format!(
                "Unsupported word count: {}. Only 12 and 24 are supported.",
                word_count
            )));
        }
    };
    
    let generated = <Mnemonic as GeneratableKey<Tap>>::generate((wc, Language::English))
        .map_err(|e| CryptoError::Mnemonic(format!("{:?}", e)))?;
    
    Ok(generated.to_string())
}

/// Validate a BIP39 mnemonic string.
///
/// Checks that all words are valid BIP39 English words and the
/// checksum is correct. Returns Ok(()) on success.
pub fn validate_mnemonic(mnemonic_str: &str) -> Result<(), CryptoError> {
    Mnemonic::parse_in(Language::English, mnemonic_str)
        .map_err(|e| CryptoError::Mnemonic(e.to_string()))?;
    Ok(()) 
}
