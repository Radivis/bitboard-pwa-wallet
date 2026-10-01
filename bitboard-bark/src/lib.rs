pub const BARK_SIGNET_SERVER_URL: &str = "https://ark.signet.2nd.dev";
pub const BARK_SIGNET_ESPLORA_URL: &str = "https://esplora.signet.2nd.dev";

mod exit_address;
mod sync_gate;
mod vtxo_list;

#[cfg(target_arch = "wasm32")]
mod history;
#[cfg(target_arch = "wasm32")]
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_link;
