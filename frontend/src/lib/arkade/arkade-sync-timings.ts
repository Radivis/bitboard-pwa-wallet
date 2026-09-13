/** Debounce before dashboard-triggered background Arkade operator sync (coalesces rapid query updates). */
export const ARKADE_BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS = 400

/**
 * Minimum gap between dashboard-triggered operator syncs. Query hooks schedule a background
 * sync on every fetch; without a floor that coalesces into a continuous sync loop while one
 * sync is in flight.
 */
export const ARKADE_BACKGROUND_OPERATOR_SYNC_MIN_INTERVAL_MS = 15_000
