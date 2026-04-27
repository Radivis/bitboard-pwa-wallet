import type { NetworkMode } from '@/stores/walletStore'
import {
  FAUCET_ENTRIES,
  type FaucetEntry,
  type FaucetStackId,
} from '@/lib/faucet-definitions'

/** Result of a browser reachability probe (tri-state). */
export type FaucetReachability = 'online' | 'offline' | 'unknown'

function parseUrlHostPath(
  urlString: string,
): { hostname: string; pathname: string } | null {
  try {
    const u = new URL(urlString)
    return { hostname: u.hostname, pathname: u.pathname }
  } catch {
    return null
  }
}

function isMempoolSpaceTestnet4(urlString: string): boolean {
  const parsed = parseUrlHostPath(urlString)
  return (
    parsed != null &&
    parsed.hostname === 'mempool.space' &&
    parsed.pathname.includes('/testnet4/')
  )
}

function isMutinynetHost(urlString: string): boolean {
  const parsed = parseUrlHostPath(urlString)
  return parsed != null && parsed.hostname === 'mutinynet.com'
}

/** Same-origin proxy using the `default` provider (mempool testnet4 / mutinynet signet). */
function isDefaultApiEsploraProxyForNetwork(
  urlString: string,
  network: 'testnet' | 'signet',
): boolean {
  const parsed = parseUrlHostPath(urlString)
  if (parsed == null) return false
  return parsed.pathname.includes(`/api/esplora/default/${network}`)
}

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
      if (isDefaultApiEsploraProxyForNetwork(resolvedEsploraUrl, 'testnet')) {
        return 'mempool_testnet4'
      }
      if (isMempoolSpaceTestnet4(resolvedEsploraUrl)) {
        return 'mempool_testnet4'
      }
      return null
    }
    if (isMempoolSpaceTestnet4(customEsploraUrl)) {
      return 'mempool_testnet4'
    }
    return null
  }

  if (networkMode === 'signet') {
    if (customEsploraUrl === null) {
      if (isDefaultApiEsploraProxyForNetwork(resolvedEsploraUrl, 'signet')) {
        return 'mutinynet_signet'
      }
      if (isMutinynetHost(resolvedEsploraUrl)) {
        return 'mutinynet_signet'
      }
      return null
    }
    if (isMutinynetHost(customEsploraUrl)) {
      return 'mutinynet_signet'
    }
    return null
  }

  return null
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
