use crate::Error;
use std::future::Future;

/// `std::time::Instant` panics on `wasm32-unknown-unknown`. Session open stamps this clock.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) use std::time::Instant as MonotonicInstant;

#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy, Debug)]
pub(crate) struct MonotonicInstant(f64);

#[cfg(target_arch = "wasm32")]
impl MonotonicInstant {
    pub(crate) fn now() -> Self {
        Self(js_sys::Date::now())
    }

    pub(crate) fn elapsed(&self) -> std::time::Duration {
        let delta_ms = (js_sys::Date::now() - self.0).max(0.0);
        std::time::Duration::from_millis(delta_ms as u64)
    }
}
use std::pin::Pin;
use std::task::Context;
use std::task::Poll;
use std::time::Duration;

/// Spawn a detached task. Native uses `tokio::spawn`. Browser futures hold `JsFuture`, which is
/// not `Send`; wasm32 is single-threaded, so the wrapper is only compiled there.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn spawn_future<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    tokio::spawn(future)
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn spawn_future<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: Future + 'static,
    F::Output: Send + 'static,
{
    tokio::spawn(WasmSendFuture(future))
}

#[cfg(target_arch = "wasm32")]
struct WasmSendFuture<F>(F);

#[cfg(target_arch = "wasm32")]
unsafe impl<F> Send for WasmSendFuture<F> {}

#[cfg(target_arch = "wasm32")]
impl<F: Future> Future for WasmSendFuture<F> {
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        unsafe { Pin::new_unchecked(&mut self.get_unchecked_mut().0).poll(context) }
    }
}

/// Current time as Unix seconds. Uses `js_sys::Date` on wasm32, `std::time` elsewhere.
pub(crate) fn unix_now() -> Result<i64, Error> {
    #[cfg(not(all(target_arch = "wasm32", target_os = "unknown")))]
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| Error::ad_hoc(format!("system clock before UNIX_EPOCH: {e}")))?
            .as_secs();

        i64::try_from(secs).map_err(|_| Error::ad_hoc("unix timestamp overflow"))
    }

    #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
    {
        Ok((js_sys::Date::now() / 1000.0) as i64)
    }
}

pub(crate) async fn sleep(duration: Duration) {
    #[cfg(target_arch = "wasm32")]
    {
        gloo_timers::future::sleep(duration).await
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        tokio::time::sleep(duration).await;
    }
}

/// A utility function for running async operations with timeout and error handling
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
pub(crate) async fn timeout_op<F, O>(timeout: Duration, operation: F) -> Result<O, Error>
where
    F: futures_util::future::Future<Output = O>,
{
    use futures_util::future::select;
    use futures_util::future::Either;
    use gloo_timers::future::TimeoutFuture;

    let ms = timeout.as_millis().min(u128::from(u32::MAX)) as u32;
    let timeout_future = TimeoutFuture::new(ms);

    match select(Box::pin(operation), timeout_future).await {
        Either::Left((result, _)) => Ok(result),
        Either::Right((_, _)) => Err(Error::ad_hoc(format!(
            "operation timed out after {timeout:?}"
        ))),
    }
}

#[cfg(not(all(target_arch = "wasm32", target_os = "unknown")))]
pub(crate) async fn timeout_op<F, O>(timeout: Duration, operation: F) -> Result<O, Error>
where
    F: std::future::Future<Output = O> + Send,
{
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| Error::ad_hoc(format!("operation timed out after {timeout:?}")))
}
