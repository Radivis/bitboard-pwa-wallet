// Shared test utilities used across different integration test binaries.
// Each test binary compiles this module separately, so items used only by other
// tests appear as dead_code. Allow dead_code to avoid false positives.
#[allow(dead_code)]
pub mod esplora_mocks;
#[allow(dead_code)]
pub mod wallet_fixtures;
