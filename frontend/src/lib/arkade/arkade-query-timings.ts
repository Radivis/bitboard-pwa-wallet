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

/** Rarely changing metadata (boarding address, delegator info). */
export const ARKADE_SLOW_METADATA_STALE_MS = 300_000
