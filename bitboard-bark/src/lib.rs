pub const BARK_SIGNET_SERVER_URL: &str = "https://ark.signet.2nd.dev";
pub const BARK_SIGNET_ESPLORA_URL: &str = "https://esplora.signet.2nd.dev";
pub const BARK_MAINNET_SERVER_URL: &str = "https://ark.second.tech";
pub const BARK_MAINNET_ESPLORA_URL: &str = "https://mempool.second.tech/api";

#[allow(dead_code)]
mod emergency_exit;
mod exit_address;
mod sync_gate;
mod vtxo_list;

#[cfg(any(test, target_arch = "wasm32"))]
mod record_store;

#[cfg(target_arch = "wasm32")]
mod collaborative_exit;
#[cfg(target_arch = "wasm32")]
mod history;
#[cfg(target_arch = "wasm32")]
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_link;
