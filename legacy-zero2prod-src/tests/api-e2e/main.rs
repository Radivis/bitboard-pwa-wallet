#![cfg(feature = "e2e-tests")]

//! E2E-specific integration tests that require the e2e-tests feature flag.
//! These tests depend on test-only endpoints like /api/test/subscription-token.

#[path = "../common/mod.rs"]
mod common;

mod subscription_token;
