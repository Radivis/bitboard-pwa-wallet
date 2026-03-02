//! Shared utility functions for route handlers

use uuid::Uuid;

/// Length of a UUID in simple format (32 hex chars, no hyphens)
const UUID_SIMPLE_FORMAT_LEN: usize = 32;

/// Validates that a token string is a well-formatted UUID (with or without hyphens).
/// Returns true if valid, false otherwise.
///
/// Accepts both standard UUID format (with hyphens) and simple format (32 hex chars without hyphens).
pub fn is_valid_uuid_token(token: &str) -> bool {
    // Try parsing as standard UUID format (with hyphens)
    if Uuid::parse_str(token).is_ok() {
        return true;
    }

    // Try parsing as simple format (32 hex chars without hyphens)
    if token.len() == UUID_SIMPLE_FORMAT_LEN && token.chars().all(|c| c.is_ascii_hexdigit()) {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_uuid_with_hyphens_is_accepted() {
        let uuid_with_hyphens = "550e8400-e29b-41d4-a716-446655440000";
        assert!(is_valid_uuid_token(uuid_with_hyphens));
    }

    #[test]
    fn valid_uuid_without_hyphens_is_accepted() {
        let uuid_without_hyphens = "550e8400e29b41d4a716446655440000";
        assert!(is_valid_uuid_token(uuid_without_hyphens));
    }

    #[test]
    fn invalid_uuid_is_rejected() {
        let invalid_token = "not-a-valid-uuid";
        assert!(!is_valid_uuid_token(invalid_token));
    }

    #[test]
    fn empty_string_is_rejected() {
        assert!(!is_valid_uuid_token(""));
    }

    #[test]
    fn uuid_with_invalid_characters_is_rejected() {
        let invalid_token = "550e8400e29b41d4a716446655440zzz";
        assert!(!is_valid_uuid_token(invalid_token));
    }

    #[test]
    fn too_short_string_is_rejected() {
        let too_short = "550e8400e29b41d4a71644665544000";
        assert!(!is_valid_uuid_token(too_short));
    }

    #[test]
    fn too_long_string_is_rejected() {
        let too_long = "550e8400e29b41d4a7164466554400000";
        assert!(!is_valid_uuid_token(too_long));
    }
}
