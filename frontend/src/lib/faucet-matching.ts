import type { NetworkMode } from '@/stores/walletStore'
import {
  FAUCET_ENTRIES,
  type FaucetEntry,
  type FaucetStackId,
} from '@/lib/faucet-definitions'

/** Result of a browser reachability probe (tri-state). */
export type FaucetReachability = 'online' | 'offline' | 'unknown'

/**
 * Maps the active network + Esplora configuration to a curated faucet stack, or null if we should not show faucets.
 */
export function resolveFaucetStack(
  networkMode: NetworkMode,
  customEsploraUrl: string | null,
  resolvedEsploraUrl: string,
): FaucetStackId | null {
  if (networkMode === 'testnet') {
    if (customEsploraUrl === null) {
      if (isDevEsploraProxyTestnet(resolvedEsploraUrl)) {
        return 'mempool_testnet4'
      }
      try {
        const u = new URL(resolvedEsploraUrl)
        if (
          u.hostname === 'mempool.space' &&
          u.pathname.includes('/testnet4/')
        ) {
          return 'mempool_testnet4'
        }
      } catch {
        return null
      }
      return null
    }
    try {
      const u = new URL(customEsploraUrl)
      if (
        u.hostname === 'mempool.space' &&
        u.pathname.includes('/testnet4/')
      ) {
        return 'mempool_testnet4'
      }
    } catch {
      return null
    }
    return null
  }

  if (networkMode === 'signet') {
    if (customEsploraUrl === null) {
      if (isDevEsploraProxySignet(resolvedEsploraUrl)) {
        return 'mutinynet_signet'
      }
      try {
        const u = new URL(resolvedEsploraUrl)
        if (u.hostname === 'mutinynet.com') {
          return 'mutinynet_signet'
        }
      } catch {
        return null
      }
      return null
    }
    try {
      const u = new URL(customEsploraUrl)
      if (u.hostname === 'mutinynet.com') {
        return 'mutinynet_signet'
      }
    } catch {
      return null
    }
    return null
  }

  return null
}

function isDevEsploraProxyTestnet(resolvedEsploraUrl: string): boolean {
  if (!import.meta.env.DEV) return false
  try {
    const u = new URL(resolvedEsploraUrl)
    return u.pathname.includes('/esplora-proxy/testnet')
  } catch {
    return false
  }
}

function isDevEsploraProxySignet(resolvedEsploraUrl: string): boolean {
  if (!import.meta.env.DEV) return false
  try {
    const u = new URL(resolvedEsploraUrl)
    return u.pathname.includes('/esplora-proxy/signet')
  } catch {
    return false
  }
}

export function faucetsForStack(stackId: FaucetStackId): FaucetEntry[] {
  return FAUCET_ENTRIES.filter((f) => f.stackId === stackId)
}

/**
 * GET the faucet page; classify by HTTP status vs thrown errors (CORS / network / abort).
 * Thrown errors yield `unknown`, not offline — the site may still work in a new tab.
 */
export async function checkFaucetReachability(
  url: string,
  signal: AbortSignal,
): Promise<FaucetReachability> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal,
    })
    if (res.ok) return 'online'
    return 'offline'
  } catch {
    // UNKNOWN: CORS, network errors, abort — no HTTP status to show as OFFLINE.
    return 'unknown'
  }
}
