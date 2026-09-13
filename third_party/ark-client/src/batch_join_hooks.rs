use std::cell::Cell;
use std::cell::RefCell;
use std::future::Future;
use std::pin::Pin;

use crate::batch::RegisteredBatchIntent;
use crate::Error;

pub const BATCH_JOIN_ABORTED_MESSAGE: &str = "batch join aborted by wallet";

#[cfg(target_arch = "wasm32")]
pub type OnIntentRegisteredHook =
    Box<dyn Fn(&RegisteredBatchIntent) -> Pin<Box<dyn Future<Output = Result<(), Error>>>>>;

#[cfg(not(target_arch = "wasm32"))]
pub type OnIntentRegisteredHook = Box<
    dyn Fn(&RegisteredBatchIntent) -> Pin<Box<dyn Future<Output = Result<(), Error>> + Send>>
        + Send
        + Sync,
>;

thread_local! {
    static BATCH_JOIN_ABORT: Cell<bool> = const { Cell::new(false) };
    static BATCH_JOIN_IN_FLIGHT: Cell<bool> = const { Cell::new(false) };
    static ON_INTENT_REGISTERED: RefCell<Option<OnIntentRegisteredHook>> =
        const { RefCell::new(None) };
}

pub fn set_batch_join_abort(aborted: bool) {
    BATCH_JOIN_ABORT.with(|flag| flag.set(aborted));
}

pub fn is_batch_join_aborted() -> bool {
    BATCH_JOIN_ABORT.with(|flag| flag.get())
}

pub fn set_batch_join_in_flight(in_flight: bool) {
    BATCH_JOIN_IN_FLIGHT.with(|flag| flag.set(in_flight));
}

pub fn is_batch_join_in_flight() -> bool {
    BATCH_JOIN_IN_FLIGHT.with(|flag| flag.get())
}

pub struct BatchJoinInFlightGuard;

impl BatchJoinInFlightGuard {
    pub fn acquire() -> Self {
        set_batch_join_in_flight(true);
        Self
    }
}

impl Drop for BatchJoinInFlightGuard {
    fn drop(&mut self) {
        set_batch_join_in_flight(false);
    }
}

pub fn set_on_intent_registered(hook: Option<OnIntentRegisteredHook>) {
    ON_INTENT_REGISTERED.with(|slot| *slot.borrow_mut() = hook);
}

pub(crate) async fn notify_intent_registered(intent: &RegisteredBatchIntent) -> Result<(), Error> {
    let future = ON_INTENT_REGISTERED.with(|slot| slot.borrow().as_ref().map(|hook| hook(intent)));
    match future {
        Some(fut) => fut.await,
        None => Ok(()),
    }
}
