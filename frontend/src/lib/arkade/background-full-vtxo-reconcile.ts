import type { BackgroundFullVtxoReconcileOutcome } from '@/workers/arkade-api'

/**
 * Map the WASM full-list result. Operator trust pending is success-shaped for the
 * scheduler and distinct from a completed reconcile (ARK-TRUST-07).
 */
export function backgroundFullReconcileFinishedOutcome(
  wasmResult: unknown,
): BackgroundFullVtxoReconcileOutcome {
  if (wasmResultReportsOperatorTrustPending(wasmResult)) {
    return { ok: true, operatorTrustPending: true }
  }
  return { ok: true }
}

/**
 * Map a background maintenance result. A discover_keys failure is distinct from a
 * catch-up warning produced after discovery succeeded.
 */
export function backgroundMaintenanceFinishedOutcome(
  wasmResult: unknown,
  ranDiscovery: boolean,
): BackgroundFullVtxoReconcileOutcome {
  const keyDiscoveryWarning = stringField(wasmResult, 'keyDiscoveryWarning')
  const discoveryCompleted = boolField(wasmResult, 'keyDiscoveryCompleted')
  if (ranDiscovery && keyDiscoveryWarning != null && !discoveryCompleted) {
    return {
      ok: false,
      keyDiscoveryFailed: true,
      warningMessage: keyDiscoveryWarning,
    }
  }
  const syncWarning = stringField(wasmResult, 'syncWarning')
  return {
    ...backgroundFullReconcileFinishedOutcome(wasmResult),
    keyDiscoveryCompleted: ranDiscovery && discoveryCompleted,
    exitingVtxoWarning: syncWarning,
  }
}

/** Discovery talks to the operator. Autonomous mode defers that flight, including a bundled full list. */
export function backgroundMaintenanceDeferral(params: {
  runDiscovery: boolean
  runFullReconcile: boolean
  autonomousActive: boolean
}): { defer: boolean; fullReconcileDeferred: boolean } {
  if (!params.runDiscovery || !params.autonomousActive) {
    return { defer: false, fullReconcileDeferred: false }
  }
  return { defer: true, fullReconcileDeferred: params.runFullReconcile }
}

/** After leaving autonomous mode, run a discovery flight that was deferred, then a due full list. */
export function backgroundWorkAfterLeavingAutonomousMode(params: {
  discoveryWasDeferred: boolean
  fullReconcileWasDeferred: boolean
  fullReconcileDue: boolean | undefined
}): {
  scheduleKeyDiscovery: boolean
  includeFullReconcile: boolean
  scheduleFullReconcileOnly: boolean
} {
  if (params.discoveryWasDeferred) {
    return {
      scheduleKeyDiscovery: true,
      includeFullReconcile:
        params.fullReconcileWasDeferred || params.fullReconcileDue === true,
      scheduleFullReconcileOnly: false,
    }
  }
  return {
    scheduleKeyDiscovery: false,
    includeFullReconcile: false,
    scheduleFullReconcileOnly: params.fullReconcileDue === true,
  }
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value == null || !(key in value)) {
    return undefined
  }
  const field = value[key as keyof typeof value]
  return typeof field === 'string' && field !== '' ? field : undefined
}

function boolField(value: unknown, key: string): boolean {
  if (typeof value !== 'object' || value == null || !(key in value)) {
    return false
  }
  return value[key as keyof typeof value] === true
}

function wasmResultReportsOperatorTrustPending(wasmResult: unknown): boolean {
  if (typeof wasmResult !== 'object' || wasmResult == null) {
    return false
  }
  return (
    'operatorTrustPending' in wasmResult && wasmResult.operatorTrustPending === true
  )
}

/**
 * One in-flight full VTXO list. Schedules during that run collapse into one
 * follow-up after it finishes, including when the in-flight run fails.
 */
export function createSingleFlightScheduler(run: () => Promise<void>): () => void {
  let inFlight: Promise<void> | null = null
  let followUpQueued = false

  const start = (): void => {
    const task = run().finally(() => {
      if (inFlight !== task) {
        return
      }
      inFlight = null
      if (!followUpQueued) {
        return
      }
      followUpQueued = false
      start()
    })
    inFlight = task
  }

  return () => {
    if (inFlight != null) {
      followUpQueued = true
      return
    }
    start()
  }
}
