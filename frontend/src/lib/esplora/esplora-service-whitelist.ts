/** Networks that use the same-origin Esplora proxy on hosted builds. */
export type EsploraProxyNetwork = 'mainnet' | 'testnet' | 'signet'

export type EsploraProviderId = 'default' | 'blockstream' | 'legacy'

type ProviderBases = Partial<Record<EsploraProxyNetwork, string>>

/**
 * Allowlisted Esplora HTTP bases per provider. Only these may be reached via `/api/esplora/...`.
 * Keep in sync with {@link DEFAULT_ESPLORA_URLS} for `default`.
 */
export const ESPLORA_PROVIDER_BASES: Record<EsploraProviderId, ProviderBases> = {
  default: {
    mainnet: 'https://mempool.space/api',
    testnet: 'https://mempool.space/testnet4/api',
    signet: 'https://mutinynet.com/api',
  },
  /** Public Blockstream Esplora mirrors (no testnet4 row — chain differs from app testnet). */
  blockstream: {
    mainnet: 'https://blockstream.info/api',
    signet: 'https://blockstream.info/signet/api',
  },
  /**
   * Bitcoin testnet **3** (not testnet4) and **standard signet** (not Mutinynet).
   * Signet uses mempool.space so it does not share the same base URL as `blockstream.signet`.
   */
  legacy: {
    testnet: 'https://blockstream.info/testnet/api',
    signet: 'https://mempool.space/signet/api',
  },
}

export const ESPLORA_PROVIDER_IDS = Object.keys(
  ESPLORA_PROVIDER_BASES,
) as EsploraProviderId[]

/** Same-origin path prefix for the Edge / Vite proxy (no trailing slash). */
export const ESPLORA_SAME_ORIGIN_PROXY_PREFIX = '/api/esplora'

export function isEsploraProxyNetwork(
  mode: string,
): mode is EsploraProxyNetwork {
  return mode === 'mainnet' || mode === 'testnet' || mode === 'signet'
}

/**
 * Normalizes an Esplora base URL for comparison (lowercase host, no trailing slash on path, no query/hash).
 */
export function normalizeEsploraBaseUrl(urlString: string): string | null {
  try {
    const u = new URL(urlString.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    u.search = ''
    u.hostname = u.hostname.toLowerCase()
    let path = u.pathname
    while (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    u.pathname = path
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Provider + network for routing through the same-origin proxy. */
export type WhitelistedEsploraMatch = {
  providerId: EsploraProviderId
}

/**
 * If `customUrl` matches a whitelisted base for `networkMode`, returns how to route via the proxy.
 */
export function customEsploraMatchesWhitelistedBase(
  customUrl: string,
  networkMode: string,
): WhitelistedEsploraMatch | null {
  if (!isEsploraProxyNetwork(networkMode)) return null
  const normalizedUser = normalizeEsploraBaseUrl(customUrl)
  if (normalizedUser == null) return null

  const providerOrder: EsploraProviderId[] = ['blockstream', 'legacy', 'default']
  for (const providerId of providerOrder) {
    const base = ESPLORA_PROVIDER_BASES[providerId][networkMode]
    if (base == null) continue
    if (normalizeEsploraBaseUrl(base) === normalizedUser) {
      return { providerId }
    }
  }
  return null
}

export function isWhitelistedEsploraBaseUrl(
  url: string,
  networkMode: string,
): boolean {
  if (!isEsploraProxyNetwork(networkMode)) return true
  return customEsploraMatchesWhitelistedBase(url, networkMode) != null
}

/**
 * Show Settings warning for public networks when the URL is not on the allowlist (regtest/lab skipped).
 */
export function shouldWarnEsploraNotWhitelisted(
  url: string,
  networkMode: string,
): boolean {
  if (!isEsploraProxyNetwork(networkMode)) return false
  const t = url.trim()
  if (t === '') return false
  return !isWhitelistedEsploraBaseUrl(t, networkMode)
}

export function getUpstreamBaseForEsploraProxy(
  providerId: string,
  network: string,
): string | null {
  if (!isEsploraProxyNetwork(network)) return null
  if (!isKnownEsploraProviderId(providerId)) return null
  const base = ESPLORA_PROVIDER_BASES[providerId][network]
  return base ?? null
}

export function isKnownEsploraProviderId(id: string): id is EsploraProviderId {
  return id === 'default' || id === 'blockstream' || id === 'legacy'
}

export type EsploraViteProxyEntry = {
  /** e.g. `/api/esplora/default/mainnet` */
  localPrefix: string
  targetOrigin: string
  /** Path prefix on target host (no trailing slash), e.g. `/api` or `/testnet4/api` */
  upstreamPathPrefix: string
}

/**
 * Builds Vite `server.proxy` entries: each local prefix is forwarded to `targetOrigin + upstreamPathPrefix + rest`.
 */
export function esploraViteProxyEntries(): EsploraViteProxyEntry[] {
  const entries: EsploraViteProxyEntry[] = []
  for (const providerId of ESPLORA_PROVIDER_IDS) {
    const bases = ESPLORA_PROVIDER_BASES[providerId]
    for (const network of Object.keys(bases) as EsploraProxyNetwork[]) {
      const baseUrl = bases[network]
      if (baseUrl == null) continue
      const u = new URL(baseUrl)
      const upstreamPathPrefix = u.pathname.replace(/\/$/, '') || '/'
      entries.push({
        localPrefix: `${ESPLORA_SAME_ORIGIN_PROXY_PREFIX}/${providerId}/${network}`,
        targetOrigin: `${u.protocol}//${u.host}`,
        upstreamPathPrefix,
      })
    }
  }
  return entries
}
