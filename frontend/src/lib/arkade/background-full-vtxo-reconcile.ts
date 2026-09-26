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
