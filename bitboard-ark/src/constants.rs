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

/// Placeholder when operator getInfo omits `fees.tx_fee_rate`. Not used for fee calculations.
pub const DEFAULT_TX_FEE_RATE: &str = "1";
pub const MIN_FEE_RATE_SAT_PER_VB: f64 = 0.1;
pub const ESPLORA_FEE_ESTIMATE_BLOCK_TARGET: u16 = 1;

/// Renew VTXOs when remaining lifetime drops below this fraction of total lifetime.
pub const VTXO_SELF_RENEW_REMAINING_FRACTION: f64 = 0.10;

/// Estimated vsize of a unilateral-exit child transaction for fee lower-bound estimates.
pub const UNILATERAL_EXIT_CHILD_VSIZE_VB: u64 = 140;

/// Bitcoin witness scale factor (non-witness bytes count 4× toward block weight).
const BITCOIN_WITNESS_SCALE_FACTOR: u64 = 4;

// CPFP bump-child weight estimates — mirrors ark-core [`build_anchor_tx`].

/// Non-witness serialized bytes of a P2TR keyspend input (bumper wallet spend).
const UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_NON_WITNESS_BYTES: u64 = 57;
/// Witness bytes of a P2TR keyspend input (Schnorr signature).
const UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_WITNESS_BYTES: u64 = 64;
/// Weight of the bumper P2TR keyspend input in the CPFP child transaction.
pub(crate) const UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_INPUT_WEIGHT: u64 =
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_NON_WITNESS_BYTES * BITCOIN_WITNESS_SCALE_FACTOR
        + UNILATERAL_EXIT_BUMP_CHILD_P2TR_KEYSPEND_WITNESS_BYTES;

/// Non-witness serialized bytes of the nested P2WSH input spending the parent P2A anchor.
const UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_NON_WITNESS_BYTES: u64 = 91;
/// Witness bytes of the nested P2WSH input (minimal witness stack).
const UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_WITNESS_BYTES: u64 = 3;
/// Weight of the nested P2WSH anchor input in the CPFP child transaction.
pub(crate) const UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_INPUT_WEIGHT: u64 =
    UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_NON_WITNESS_BYTES * BITCOIN_WITNESS_SCALE_FACTOR
        + UNILATERAL_EXIT_BUMP_CHILD_NESTED_P2WSH_WITNESS_BYTES;

/// Serialized bytes of the P2TR output in the CPFP child transaction.
const UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_SERIALIZED_BYTES: u64 = 43;
/// Weight of the P2TR output in the CPFP child transaction.
pub(crate) const UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_WEIGHT: u64 =
    UNILATERAL_EXIT_BUMP_CHILD_P2TR_OUTPUT_SERIALIZED_BYTES * BITCOIN_WITNESS_SCALE_FACTOR;

/// Confirmations required before stamping `is_unrolled` on a published virtual tx
/// (leaf or intermediate host).
pub const UNILATERAL_EXIT_LEAF_CONFIRMATIONS: u32 = 6;

/// Confirmations required on each intermediate virtual tx before advancing to the next step.
pub const UNILATERAL_EXIT_STEP_CONFIRMATIONS: u32 = 1;

/// Esplora poll interval while waiting for the current unroll step to confirm.
pub const UNILATERAL_EXIT_STEP_CONFIRMATION_POLL_INTERVAL_SECS: u64 = 15;

/// Reuse `/tx/{txid}/outspends` for this long when the probed output is still unspent.
pub const UNSPENT_OUTSPEND_CACHE_TTL_MS: u64 = 8_000;

pub const NETWORK_MODE_MAINNET: &str = "mainnet";
pub const NETWORK_MODE_TESTNET: &str = "testnet";
pub const NETWORK_MODE_SIGNET: &str = "signet";
pub const NETWORK_MODE_REGTEST: &str = "regtest";

/// Matches ark-client `prepare_intent` Register `expire_at = now + 2 * 60` (ARK-UP-03).
/// Keep the frontend `BOARDING_REGISTER_INTENT_TTL_SECS` in sync.
pub const BOARDING_REGISTER_INTENT_TTL_SECS: i64 = 2 * 60;
