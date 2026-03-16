//! WASM-only sleep and sleeper for async Esplora client.
//!
//! This module uses `setTimeout` and is only compiled for `wasm32`. Native coverage
//! (`cargo llvm-cov` on the host) will show 0% for this file; that is expected.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;

use bdk_esplora::esplora_client::r#async::Sleeper;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = setTimeout)]
    fn set_timeout(closure: &js_sys::Function, millis: i32) -> f64;
}

/// A [`Future`] that resolves after a browser `setTimeout` delay.
///
/// # Safety
/// `unsafe impl Send` is sound here because WASM (without threads) is
/// single-threaded -- the future will never actually be sent across threads.
pub struct WasmSleep {
    inner: JsFuture,
}

unsafe impl Send for WasmSleep {}

impl Future for WasmSleep {
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        match Pin::new(&mut self.get_mut().inner).poll(cx) {
            Poll::Ready(_) => Poll::Ready(()),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// WASM-compatible [`Sleeper`] backed by `setTimeout`.
#[derive(Debug, Clone, Copy)]
pub struct WasmSleeper;

impl Sleeper for WasmSleeper {
    type Sleep = WasmSleep;

    fn sleep(dur: Duration) -> Self::Sleep {
        let ms = dur.as_millis() as i32;
        let promise = js_sys::Promise::new(&mut |resolve, _| {
            set_timeout(&resolve, ms);
        });
        WasmSleep {
            inner: JsFuture::from(promise),
        }
    }
}
