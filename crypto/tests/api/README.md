# Integration Test Helpers

This directory contains test utilities for integration tests.

## Relationship to `src/test_support/`

There is intentional code similarity between `tests/api/` and `src/test_support/`:

- **`tests/api/`** - Used by integration tests (this directory)
  - Contains full `TestApp` with all helper methods needed for API testing
  - Includes test-specific utilities like `mount_mock_email_server`
  - Used by `cargo test`

- **`src/test_support/`** - Used by the `spawn_test_server` binary for E2E tests
  - Subset of functionality needed for E2E testing
  - Only available with `e2e-tests` feature flag
  - Used by frontend Playwright tests via the `spawn_test_server` binary

## Why not consolidate?

1. **Different purposes**: Integration tests need more comprehensive test utilities than E2E tests
2. **Feature isolation**: E2E test support is behind a feature flag to keep production builds clean
3. **Test independence**: Integration tests should not depend on optional features

## Future improvements

If the code duplication becomes problematic, we could:
- Extract common functionality into a `test-utils` crate
- Make integration tests conditionally use `src/test_support/` when available
- Create a unified test harness that both can depend on
