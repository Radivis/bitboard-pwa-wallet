pub const BARK_SIGNET_SERVER_URL: &str = "https://ark.signet.2nd.dev";
pub const BARK_SIGNET_ESPLORA_URL: &str = "https://esplora.signet.2nd.dev";

mod sync_gate;

#[cfg(target_arch = "wasm32")]
mod session;
#[cfg(target_arch = "wasm32")]
mod wasm_link;
