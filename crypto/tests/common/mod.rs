//! Common test utilities shared between regular and e2e tests.
//! This module is accessible in both tests/api and tests/api-e2e.

// Allow unused code in test utilities - not all helpers are used by all test binaries
#![allow(dead_code)]
#![allow(unused_imports)]

pub mod helpers;
pub mod macros;
pub mod test_app;
pub mod test_data;

// Re-export commonly used items for convenience
pub use helpers::*;
pub use macros::function_name_macro::function_name;
// TestAppContainerWithUser, TestUser may remain unused, but are still exported for convenience.
#[allow(unused_imports)]
pub use test_app::{
    TestApp, TestAppContainerWithUser, TestUser, spawn_app, spawn_app_container_with_user,
};
pub use test_data::*;
