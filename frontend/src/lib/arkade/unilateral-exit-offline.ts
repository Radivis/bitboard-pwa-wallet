/** Unilateral exit never syncs with the ASP after proceed/complete/unroll. */
export function shouldSyncOperatorAfterUnilateralExitOperation(): boolean {
  return false
}

/** Background dashboard poll talks to the ASP; skip it while autonomous mode is active. */
export function shouldSkipBackgroundOperatorSyncWhenAutonomous(
  autonomousModeActive: boolean,
): boolean {
  return autonomousModeActive
}
