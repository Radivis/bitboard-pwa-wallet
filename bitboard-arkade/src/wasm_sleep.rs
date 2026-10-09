//! WASM Esplora sleeper — thin adapter over shared `bitboard-wasm-sleep`.

use std::time::Duration;

use esplora_client::Sleeper;

pub use bitboard_wasm_sleep::WasmSleep;

#[derive(Debug, Clone, Copy)]
pub struct WasmSleeper;

impl Sleeper for WasmSleeper {
    type Sleep = WasmSleep;

    fn sleep(dur: Duration) -> Self::Sleep {
        bitboard_wasm_sleep::sleep_for(dur)
    }
}
