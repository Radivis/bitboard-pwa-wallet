/** React Query timings shared by dashboard, wallet management, and send flow. */
export const LIGHTNING_DASHBOARD_REFETCH_MS = 60_000
export const LIGHTNING_DASHBOARD_STALE_MS = 30_000

/** Per-connection balance (management, send picker); matches dashboard stale window. */
export const LN_WALLET_BALANCE_STALE_MS = LIGHTNING_DASHBOARD_STALE_MS

/** NWC vs Esplora tip comparison; aligned with dashboard refetch interval. */
export const LN_WALLET_NETWORK_PLAUSIBILITY_STALE_MS =
  LIGHTNING_DASHBOARD_REFETCH_MS
