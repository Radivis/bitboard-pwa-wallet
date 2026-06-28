//! Shared literals for Arkade WASM API boundaries and fee defaults.

pub const PAYMENT_DIRECTION_INCOMING: &str = "incoming";
pub const PAYMENT_DIRECTION_OUTGOING: &str = "outgoing";

pub const UNROLL_EVENT_TYPE_UNROLL: &str = "unroll";
pub const UNROLL_EVENT_TYPE_WAIT: &str = "wait";
pub const UNROLL_EVENT_TYPE_DONE: &str = "done";

pub const VTXO_STATUS_SPENT: &str = "spent";
pub const VTXO_STATUS_UNROLLED: &str = "unrolled";
pub const VTXO_STATUS_PRECONFIRMED: &str = "preconfirmed";
pub const VTXO_STATUS_RECOVERABLE: &str = "recoverable";
pub const VTXO_STATUS_SETTLED: &str = "settled";

pub const DEFAULT_TX_FEE_RATE: &str = "1";
pub const MIN_FEE_RATE_SAT_PER_VB: f64 = 0.1;
pub const ESPLORA_FEE_ESTIMATE_BLOCK_TARGET: u16 = 1;

/// Renew VTXOs when remaining lifetime drops below this fraction of total lifetime.
pub const VTXO_SELF_RENEW_REMAINING_FRACTION: f64 = 0.10;

/// Estimated vsize of a unilateral-exit child transaction for fee lower-bound estimates.
pub const UNILATERAL_EXIT_CHILD_VSIZE_VB: u64 = 140;

pub const NETWORK_MODE_MAINNET: &str = "mainnet";
pub const NETWORK_MODE_TESTNET: &str = "testnet";
pub const NETWORK_MODE_SIGNET: &str = "signet";
pub const NETWORK_MODE_REGTEST: &str = "regtest";
