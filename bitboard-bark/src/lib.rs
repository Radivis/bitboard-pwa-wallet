/// Second's public Signet Ark server.
/// Keep in sync with `BARK_SIGNET_SERVER_URL` in
/// `frontend/src/lib/wallet/wallet-domain-types.ts`.
pub const BARK_SIGNET_SERVER_URL: &str = "https://ark.signet.2nd.dev";
pub const BARK_SIGNET_ESPLORA_URL: &str = "https://esplora.signet.2nd.dev";
/// Second's public Mainnet Ark server.
/// Keep in sync with `BARK_MAINNET_SERVER_URL` in
/// `frontend/src/lib/wallet/wallet-domain-types.ts`.
pub const BARK_MAINNET_SERVER_URL: &str = "https://ark.second.tech";
pub const BARK_MAINNET_ESPLORA_URL: &str = "https://mempool.second.tech/api";

#[cfg(any(test, target_arch = "wasm32"))]
mod emergency_exit;
#[cfg(any(test, target_arch = "wasm32", feature = "regtest-support"))]
mod exit_address;
#[cfg(any(test, target_arch = "wasm32", feature = "regtest-support"))]
mod offboard_retirement;
#[cfg(any(test, target_arch = "wasm32"))]
mod pending_actions;
#[cfg(any(test, target_arch = "wasm32"))]
mod sync_gate;
#[cfg(any(test, target_arch = "wasm32"))]
mod vtxo_list;

#[cfg(any(test, target_arch = "wasm32", feature = "regtest-support"))]
mod record_store;

#[cfg(any(test, target_arch = "wasm32"))]
mod refresh;
#[cfg(all(feature = "regtest-support", not(target_arch = "wasm32")))]
pub mod regtest_session;
#[cfg(any(test, target_arch = "wasm32"))]
mod required_sync;

#[cfg(target_arch = "wasm32")]
mod arkoor;
#[cfg(target_arch = "wasm32")]
mod board;
#[cfg(target_arch = "wasm32")]
mod collaborative_exit;
#[cfg(target_arch = "wasm32")]
mod history;
#[cfg(target_arch = "wasm32")]
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_link;
