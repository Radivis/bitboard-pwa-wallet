//! WASM Esplora sleeper — thin adapter over shared `bitboard-wasm-sleep`.

use std::time::Duration;

use bdk_esplora::esplora_client::r#async::Sleeper;

pub use bitboard_wasm_sleep::WasmSleep;

/// WASM-compatible [`Sleeper`] backed by `setTimeout`.
#[derive(Debug, Clone, Copy)]
pub struct WasmSleeper;

impl Sleeper for WasmSleeper {
    type Sleep = WasmSleep;

    fn sleep(dur: Duration) -> Self::Sleep {
        bitboard_wasm_sleep::sleep_for(dur)
    }
}
