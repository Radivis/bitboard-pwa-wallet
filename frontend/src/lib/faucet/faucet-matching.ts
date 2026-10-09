import {
  faucetsForNetwork,
  getFaucetProxyUrl,
  type FaucetEntry,
  type FaucetNetwork,
} from '@/lib/faucet/faucet-definitions'

export { faucetsForNetwork, type FaucetEntry, type FaucetNetwork }

/** Result of a browser reachability probe (tri-state). */
export type FaucetReachability = 'online' | 'offline' | 'unknown'

/**
 * GET the faucet page via same-origin proxy; classify by HTTP status vs thrown errors.
 * Uses the proxy to avoid CORS issues with third-party faucet sites.
 */
export async function checkFaucetReachability(
  faucetId: string,
  signal: AbortSignal,
): Promise<FaucetReachability> {
  const proxyUrl = getFaucetProxyUrl(faucetId)
  try {
    const fetchResponse = await fetch(proxyUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal,
    })
    if (fetchResponse.ok) return 'online'
    if (fetchResponse.status === 502) return 'offline'
    return 'offline'
  } catch {
    return 'unknown'
  }
}
