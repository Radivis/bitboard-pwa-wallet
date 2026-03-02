//! Test support utilities for integration and E2E tests
//! Only available when the 'e2e-tests' feature is enabled

pub mod helpers;
pub mod test_app;

pub use test_app::{TestApp, TestUser, spawn_app};
