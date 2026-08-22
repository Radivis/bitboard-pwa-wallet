/** React Query timings shared by Arkade dashboard, management, and exit flows. */

/** Dashboard balance/history poll while tab is visible. */
export const ARKADE_DASHBOARD_REFETCH_MS = 15_000

/** Dashboard balance/history stale window (also used by Receive remount refresh). */
export const ARKADE_DASHBOARD_STALE_MS = 30_000

/** Boarding status, exit candidates, bumper info — session-bound data that changes during flows. */
export const ARKADE_SESSION_POLL_STALE_MS = 15_000

/** Boarding status background poll interval. */
export const ARKADE_BOARDING_STATUS_REFETCH_MS = 30_000

/** While a RegisterIntent is waiting for the operator, poll boarding/balance until spend. */
export const ARKADE_PENDING_BATCH_INTENT_POLL_MS = 8_000

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

/** Automatic unilateral-exit runner: poll while waiting for step confirmation (production). */
export const UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS = 15_000

/** After package-not-child, wait before retrying broadcast so the submit node can learn the parent. */
export const UNILATERAL_EXIT_PARENT_DATA_WAIT_MS = 15_000

/** Re-broadcast a step when Esplora still reports 0 confirmations (production, 30 minutes). */
export const UNILATERAL_EXIT_AUTOMATION_STEP_REBROADCAST_WAIT_SECS = 1_800

/** Regtest / E2E: faster poll while steps confirm against a local Esplora. */
export const UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS_REGTEST = 2_000

/** Regtest / E2E: retry broadcast sooner when a step tx never appears on chain. */
export const UNILATERAL_EXIT_AUTOMATION_STEP_REBROADCAST_WAIT_SECS_REGTEST = 45

export function unilateralExitAutomationWaitPollMs(
  networkMode: string,
): number {
  return networkMode === 'regtest'
    ? UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS_REGTEST
    : UNILATERAL_EXIT_AUTOMATION_WAIT_POLL_MS
}

export function unilateralExitAutomationStepRebroadcastWaitSecs(
  networkMode: string,
): number {
  return networkMode === 'regtest'
    ? UNILATERAL_EXIT_AUTOMATION_STEP_REBROADCAST_WAIT_SECS_REGTEST
    : UNILATERAL_EXIT_AUTOMATION_STEP_REBROADCAST_WAIT_SECS
}

/** Machine poll while a step is waiting for confirmation (production). Not used by the display query while a job is active. */
export const UNILATERAL_EXIT_PROGRESS_POLL_MS = 3_000

/** Display-query poll when no job is active and WASM reports phase idle (production). */
export const UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS = 15_000

/** Regtest / E2E: machine wait poll so automation and Playwright see step advances. */
export const UNILATERAL_EXIT_PROGRESS_POLL_MS_REGTEST = 2_000

export const UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS_REGTEST = 2_000

export function unilateralExitProgressPollMs(networkMode: string): number {
  return networkMode === 'regtest'
    ? UNILATERAL_EXIT_PROGRESS_POLL_MS_REGTEST
    : UNILATERAL_EXIT_PROGRESS_POLL_MS
}

export function unilateralExitProgressIdlePollMs(networkMode: string): number {
  return networkMode === 'regtest'
    ? UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS_REGTEST
    : UNILATERAL_EXIT_PROGRESS_IDLE_POLL_MS
}
