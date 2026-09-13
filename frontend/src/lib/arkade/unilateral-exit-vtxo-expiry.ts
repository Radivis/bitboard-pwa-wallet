import type { ArkadeUnilateralExitHostOutpoint } from '@/workers/arkade-api'

const DAY_SECONDS = 86_400

export const UNILATERAL_EXIT_VTXO_EXPIRY_WARNING_SECONDS = 3 * DAY_SECONDS

export type UnilateralExitVtxoExpiryUrgency = 'expired' | 'warning' | null

function remainingExpirySeconds(
  expiresAt: number | null | undefined,
  nowSeconds: number,
): number | null {
  if (expiresAt == null || expiresAt <= 0) {
    return null
  }
  return expiresAt - nowSeconds
}

function formatRemainingDaysCopy(remainingSeconds: number): string {
  if (remainingSeconds < DAY_SECONDS) {
    return 'expires in less than 1 day'
  }
  const remainingDays = Math.floor(remainingSeconds / DAY_SECONDS)
  if (remainingDays === 1) {
    return 'expires in 1 day'
  }
  return `expires in ${remainingDays} days`
}

function urgencyForRemainingSeconds(
  remainingSeconds: number,
): UnilateralExitVtxoExpiryUrgency {
  if (remainingSeconds <= 0) {
    return 'expired'
  }
  if (remainingSeconds < UNILATERAL_EXIT_VTXO_EXPIRY_WARNING_SECONDS) {
    return 'warning'
  }
  return null
}

export function formatUnilateralExitVtxoExpiryRemaining(
  expiresAt: number | null | undefined,
  nowSeconds: number,
): string | null {
  const remainingSeconds = remainingExpirySeconds(expiresAt, nowSeconds)
  if (remainingSeconds == null) {
    return null
  }
  if (remainingSeconds <= 0) {
    return 'expired'
  }
  return formatRemainingDaysCopy(remainingSeconds)
}

export function hostTxVtxoExpiryUrgency(
  hostOutpoints: ReadonlyArray<Pick<ArkadeUnilateralExitHostOutpoint, 'expiresAt'>>,
  nowSeconds: number,
): UnilateralExitVtxoExpiryUrgency {
  let warningFound = false
  for (const hostOutpoint of hostOutpoints) {
    const remainingSeconds = remainingExpirySeconds(hostOutpoint.expiresAt, nowSeconds)
    if (remainingSeconds == null) {
      continue
    }
    const urgency = urgencyForRemainingSeconds(remainingSeconds)
    if (urgency === 'expired') {
      return 'expired'
    }
    if (urgency === 'warning') {
      warningFound = true
    }
  }
  return warningFound ? 'warning' : null
}

export function unilateralExitTreeNodeExpiryFillClass(
  urgency: UnilateralExitVtxoExpiryUrgency,
): string | undefined {
  if (urgency === 'expired') {
    return 'bg-red-900 text-red-50'
  }
  if (urgency === 'warning') {
    return 'bg-yellow-800 text-yellow-50'
  }
  return undefined
}
