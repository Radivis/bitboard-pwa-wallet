//! Shared test data constants to avoid magic strings across integration tests

pub const TEST_SUBSCRIBER_NAME: &str = "le guin";
pub const TEST_SUBSCRIBER_EMAIL: &str = "ursula_le_guin@gmail.com";

/// Valid UUID format but nonexistent in database (used for 401 tests)
pub const NONEXISTENT_UUID_TOKEN: &str = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

/// Malformed token (invalid UUID format, triggers 400)
pub const MALFORMED_TOKEN: &str = "not-a-valid-uuid";
