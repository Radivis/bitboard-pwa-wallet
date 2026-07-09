import { pathnameRequiresWalletUnlock } from '@/lib/shared/pathname-requires-wallet-unlock'

const MAX_NON_WALLET_NAVIGATION_HISTORY = 32

/** Most recent non-wallet pathname at the end. */
let recentNonWalletPaths: string[] = []

/**
 * Remember a non-wallet route the user left (used when dismissing the wallet unlock gate).
 */
export function recordNonWalletNavigationLeaving(previousPathname: string): void {
  if (!previousPathname || pathnameRequiresWalletUnlock(previousPathname)) {
    return
  }
  const lastPath = recentNonWalletPaths.at(-1)
  if (lastPath === previousPathname) {
    return
  }
  const nextPaths = [...recentNonWalletPaths, previousPathname]
  recentNonWalletPaths =
    nextPaths.length <= MAX_NON_WALLET_NAVIGATION_HISTORY
      ? nextPaths
      : nextPaths.slice(nextPaths.length - MAX_NON_WALLET_NAVIGATION_HISTORY)
}

export function getLatestNonWalletPath(): string | null {
  return recentNonWalletPaths.at(-1) ?? null
}

/** @internal Test-only reset */
export function resetNonWalletNavigationHistoryForTests(): void {
  recentNonWalletPaths = []
}

/** @internal Test-only introspection */
export function getNonWalletNavigationHistoryForTests(): readonly string[] {
  return recentNonWalletPaths
}
