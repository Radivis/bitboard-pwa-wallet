import { NWCClient } from '@getalby/sdk'

/** Alby NWC relays require the `/v1` path; the bare host 301-redirects and breaks browser WebSockets. */
const ALBY_NWC_RELAY_HOSTS = new Set(['relay.getalby.com', 'relay2.getalby.com'])

/** nostr-tools default (~4.4s) is tight on mobile preview / cold relay connections. */
export const NWC_RELAY_CONNECTION_TIMEOUT_MS = 15_000

/**
 * Ensures known Alby NWC relay URLs include `/v1`.
 * Other relays are returned unchanged.
 */
export function normalizeNwcRelayUrl(relayUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(relayUrl)
  } catch {
    return relayUrl
  }

  if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
    return relayUrl
  }

  if (!ALBY_NWC_RELAY_HOSTS.has(parsed.hostname.toLowerCase())) {
    return relayUrl
  }

  const path = parsed.pathname.replace(/\/$/, '')
  if (path === '' || path === '/') {
    parsed.pathname = '/v1'
    return parsed.toString()
  }

  return relayUrl
}

export function normalizeNwcRelayUrls(relayUrls: string[]): string[] {
  return relayUrls.map(normalizeNwcRelayUrl)
}

function parseRelayUrlsFromConnectionString(connectionString: string): string[] {
  const httpForm = connectionString
    .replace(/^nostr\+walletconnect:\/\//i, 'http://')
    .replace(/^nostrwalletconnect:\/\//i, 'http://')
    .replace(/^nostr\+walletconnect:/i, 'http://')
    .replace(/^nostrwalletconnect:/i, 'http://')
  const url = new URL(httpForm)
  const relayUrls = url.searchParams.getAll('relay')
  if (relayUrls.length === 0) {
    throw new Error('No relay URL found in connection string')
  }
  return relayUrls
}

function patchNwcClientRelayConnectionTimeout(client: NWCClient): void {
  const pool = client.pool as
    | {
        ensureRelay?: (
          url: string,
          params?: { connectionTimeout?: number },
        ) => Promise<unknown>
      }
    | undefined
  if (pool?.ensureRelay == null) {
    return
  }
  const originalEnsureRelay = pool.ensureRelay.bind(pool)
  pool.ensureRelay = (url, params) =>
    originalEnsureRelay(url, {
      ...params,
      connectionTimeout: NWC_RELAY_CONNECTION_TIMEOUT_MS,
    })
}

/**
 * Builds an {@link NWCClient} with Alby relay URL fixes and a longer WebSocket connect timeout.
 */
export function createNwcClient(connectionString: string): NWCClient {
  const relayUrls = normalizeNwcRelayUrls(
    parseRelayUrlsFromConnectionString(connectionString),
  )
  const client = new NWCClient({
    nostrWalletConnectUrl: connectionString,
    relayUrls,
  })
  patchNwcClientRelayConnectionTimeout(client)
  return client
}
