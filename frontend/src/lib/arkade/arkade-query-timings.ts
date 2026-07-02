/** React Query timings shared by Arkade dashboard, management, and exit flows. */

/** Dashboard balance/history poll while tab is visible. */
export const ARKADE_DASHBOARD_REFETCH_MS = 15_000

/** Dashboard balance/history stale window (also used by Receive remount refresh). */
export const ARKADE_DASHBOARD_STALE_MS = 30_000

/** Boarding status, exit candidates, bumper info — session-bound data that changes during flows. */
export const ARKADE_SESSION_POLL_STALE_MS = 15_000

/** Boarding status background poll interval. */
export const ARKADE_BOARDING_STATUS_REFETCH_MS = 30_000

/** Collaborative / unilateral exit fee estimates. */
export const ARKADE_FEE_ESTIMATE_STALE_MS = 30_000

/**
 * While the unilateral-exit dialog is open and the bumper wallet is still underfunded, re-poll the
 * bumper balance and fee estimate so the "Start unroll" gate clears automatically once the user's
 * on-chain top-up lands. Kept short because the regtest/esplora scripthash index that the bumper
 * wallet syncs against only lags the address index by a few seconds.
 */
export const ARKADE_BUMPER_FUNDING_POLL_MS = 4_000

/**
 * While the unilateral-exit dialog is open, re-poll the exit-candidate list so VTXOs that the
 * operator sweeps or that expire mid-flow stop being shown as startable (otherwise a stale row
 * lets the user start an unroll the operator will reject as "not eligible").
 */
export const ARKADE_EXIT_CANDIDATES_POLL_MS = 5_000

/** Rarely changing metadata (boarding address, delegator info). */
export const ARKADE_SLOW_METADATA_STALE_MS = 300_000
