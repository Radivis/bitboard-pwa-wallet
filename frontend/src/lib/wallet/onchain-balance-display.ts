import type { BalanceInfo } from '@/workers/crypto-types'

export interface OnChainBalanceDisplay {
  /** True when any pending or immature component is non-zero (show multi-line breakdown). */
  showBreakdown: boolean
  totalSats: number
  confirmedSats: number
  trustedPendingSats: number
  untrustedPendingSats: number
  immatureSats: number
}

/**
 * Maps BDK `BalanceInfo` to dashboard display: total headline plus optional lines
 * (settled, pending change, pending incoming, immature).
 */
export function balanceInfoToOnChainDisplay(
  balance: BalanceInfo | null,
): OnChainBalanceDisplay {
  const confirmedSats = balance?.confirmedSats ?? 0
  const trustedPendingSats = balance?.trustedPendingSats ?? 0
  const untrustedPendingSats = balance?.untrustedPendingSats ?? 0
  const immatureSats = balance?.immatureSats ?? 0
  const totalSats = balance?.totalSats ?? 0

  const showBreakdown =
    trustedPendingSats > 0 ||
    untrustedPendingSats > 0 ||
    immatureSats > 0

  if (
    import.meta.env.DEV &&
    balance != null &&
    totalSats !==
      confirmedSats +
        trustedPendingSats +
        untrustedPendingSats +
        immatureSats
  ) {
    console.warn(
      '[onchain-balance-display] BalanceInfo.totalSats does not match sum of components',
      balance,
    )
  }

  return {
    showBreakdown,
    totalSats,
    confirmedSats,
    trustedPendingSats,
    untrustedPendingSats,
    immatureSats,
  }
}
