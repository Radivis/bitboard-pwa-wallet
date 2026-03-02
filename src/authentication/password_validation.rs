use secrecy::{ExposeSecret, Secret};

/// Minimum password length (excluding spaces)
pub const MIN_PASSWORD_LENGTH: usize = 12;

/// Maximum password length (including all characters)
pub const MAX_PASSWORD_LENGTH: usize = 128;

/// Validation result for password checks
#[derive(Debug, PartialEq)]
pub enum PasswordValidationError {
    TooShort,
    TooLong,
}

/// Validates that a password meets length requirements
///
/// Requirements:
/// - At least MIN_PASSWORD_LENGTH characters (excluding spaces)
/// - At most MAX_PASSWORD_LENGTH characters (including spaces)
pub fn validate_password_length(password: &Secret<String>) -> Result<(), PasswordValidationError> {
    let password_str = password.expose_secret();

    // Check minimum length (excluding spaces)
    if password_str.replace(' ', "").len() < MIN_PASSWORD_LENGTH {
        return Err(PasswordValidationError::TooShort);
    }

    // Check maximum length (including all characters)
    if password_str.len() > MAX_PASSWORD_LENGTH {
        return Err(PasswordValidationError::TooLong);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_with_12_chars_no_spaces_is_valid() {
        let password = Secret::new("abcdefghijkl".to_string());
        assert!(validate_password_length(&password).is_ok());
    }

    #[test]
    fn password_with_spaces_reaching_12_chars_is_valid() {
        let password = Secret::new("abc def ghi jkl".to_string()); // 12 chars without spaces
        assert!(validate_password_length(&password).is_ok());
    }

    #[test]
    fn password_with_11_chars_no_spaces_is_too_short() {
        let password = Secret::new("abcdefghijk".to_string());
        assert_eq!(
            validate_password_length(&password),
            Err(PasswordValidationError::TooShort)
        );
    }

    #[test]
    fn password_with_129_chars_is_too_long() {
        let password = Secret::new("a".repeat(129));
        assert_eq!(
            validate_password_length(&password),
            Err(PasswordValidationError::TooLong)
        );
    }

    #[test]
    fn password_with_128_chars_is_valid() {
        let password = Secret::new("a".repeat(128));
        assert!(validate_password_length(&password).is_ok());
    }
}
