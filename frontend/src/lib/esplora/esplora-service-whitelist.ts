/** Networks that use the same-origin Esplora proxy on hosted builds. */
export type EsploraProxyNetwork = 'mainnet' | 'testnet' | 'signet' | 'mutinynet'

export type EsploraProviderId = 'default' | 'blockstream' | 'legacy'

type ProviderBases = Partial<Record<EsploraProxyNetwork, string>>

/**
 * Allowlisted Esplora HTTP bases per provider. Only these may be reached via `/api/esplora/...`.
 * Keep in sync with {@link DEFAULT_ESPLORA_URLS} for `default`.
 */
export const ESPLORA_PROVIDER_BASES: Record<EsploraProviderId, ProviderBases> = {
  default: {
    mainnet: 'https://mempool.space/api',
    /** Testnet4. Blockstream's unauthenticated cap (700 requests/hour) 429s a full scan. */
    testnet: 'https://mempool.space/testnet4/api',
    signet: 'https://mempool.space/signet/api',
    mutinynet: 'https://mutinynet.com/api',
  },
  /** Public Blockstream Esplora mirrors. Testnet here is testnet4, not legacy testnet3. */
  blockstream: {
    mainnet: 'https://blockstream.info/api',
    testnet: 'https://blockstream.info/testnet4/api',
    signet: 'https://blockstream.info/signet/api',
  },
  /**
   * Bitcoin testnet **3** (not testnet4). Public Signet is the default provider,
   * so this row does not repeat that URL.
   */
  legacy: {
    testnet: 'https://blockstream.info/testnet/api',
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
  return (
    mode === 'mainnet' ||
    mode === 'testnet' ||
    mode === 'signet' ||
    mode === 'mutinynet'
  )
}

/**
 * Normalizes an Esplora base URL for comparison (lowercase host, no trailing slash on path, no query/hash).
 */
export function normalizeEsploraBaseUrl(urlString: string): string | null {
  try {
    const parsedUrl = new URL(urlString.trim())
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null
    parsedUrl.hash = ''
    parsedUrl.search = ''
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase()
    let path = parsedUrl.pathname
    while (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    parsedUrl.pathname = path
    return parsedUrl.toString().replace(/\/$/, '')
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
  const trimmedUrl = url.trim()
  if (trimmedUrl === '') return false
  return !isWhitelistedEsploraBaseUrl(trimmedUrl, networkMode)
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

const ESPLORA_UPSTREAM_FAILOVER_STATUSES = new Set([502, 503, 504])

/** Blockstream's unauthenticated cap. A 429 stays on the host that sent it. */
export const ESPLORA_RATE_LIMIT_STATUS = 429

/**
 * Gateway failures only. HTTP 429 stays on the host that sent it: Blockstream's
 * unauthenticated cap is 700 requests per hour, so a full scan moved there fails
 * with Blockstream's rate-limit notice.
 */
export function isEsploraUpstreamFailoverStatus(status: number): boolean {
  return ESPLORA_UPSTREAM_FAILOVER_STATUSES.has(status)
}

export type EsploraMirrorDecision = {
  /** When false, keep the preferred response. */
  useFallbackResponse: boolean
  markPreferredHostDown: boolean
}

/**
 * Which response wins once both hosts have answered, and whether the preferred
 * host goes on cooldown. `preferredStatus` is null when that host did not answer.
 * A rate-limited mirror does not replace a failed preferred response and does
 * not start the cooldown.
 *
 * Inlined in `frontend/api/esplora/[...path].ts` because Vercel functions cannot
 * import this module. Keep that copy in sync.
 */
export function decideEsploraMirrorResponse(
  preferredStatus: number | null,
  fallbackStatus: number,
): EsploraMirrorDecision {
  const fallbackIsRateLimited = fallbackStatus === ESPLORA_RATE_LIMIT_STATUS
  if (preferredStatus == null) {
    return {
      useFallbackResponse: true,
      markPreferredHostDown: !fallbackIsRateLimited,
    }
  }
  if (!isEsploraUpstreamFailoverStatus(preferredStatus)) {
    return { useFallbackResponse: false, markPreferredHostDown: false }
  }
  if (fallbackIsRateLimited) {
    return { useFallbackResponse: false, markPreferredHostDown: false }
  }
  return { useFallbackResponse: true, markPreferredHostDown: true }
}

/**
 * Same-chain mirror when the preferred host does not connect or its gateway fails.
 * Mempool is preferred for testnet4 (Blockstream's 700/hour cap 429s a full scan).
 * Blockstream is the mirror when Mempool itself is unreachable. A 429 stays on
 * the host that sent it, so a rate-limited mirror does not replace Mempool.
 */
export function esploraFallbackUpstreamBase(
  providerId: string,
  network: string,
): string | null {
  if (providerId !== 'default' || !isEsploraProxyNetwork(network)) return null
  const preferredBase = ESPLORA_PROVIDER_BASES.default[network]
  const blockstreamBase = ESPLORA_PROVIDER_BASES.blockstream[network]
  if (preferredBase == null || blockstreamBase == null) return null
  if (normalizeEsploraBaseUrl(preferredBase) === normalizeEsploraBaseUrl(blockstreamBase)) {
    return null
  }
  return blockstreamBase
}

export type EsploraViteProxyEntry = {
  /** e.g. `/api/esplora/default/mainnet` */
  localPrefix: string
  targetOrigin: string
  /** Path prefix on target host (no trailing slash), e.g. `/api` or `/testnet4/api` */
  upstreamPathPrefix: string
}

/**
 * Local arkade-regtest Esplora (esplora_gateway). Vite-only — not a hosted Vercel upstream.
 * Use 127.0.0.1 so the Node proxy matches Playwright's IPv4-only E2E origin (not ::1 localhost).
 */
export const REGTEST_ESPLORA_UPSTREAM_BASE = 'http://127.0.0.1:7030/api'

/** Same-origin path the browser WASM client uses for regtest Esplora. */
export const REGTEST_ESPLORA_PROXY_LOCAL_PREFIX = `${ESPLORA_SAME_ORIGIN_PROXY_PREFIX}/default/regtest`

function viteProxyEntryFromBaseUrl(
  localPrefix: string,
  baseUrl: string,
): EsploraViteProxyEntry {
  const parsedBaseUrl = new URL(baseUrl)
  const upstreamPathPrefix = parsedBaseUrl.pathname.replace(/\/$/, '') || '/'
  return {
    localPrefix,
    targetOrigin: `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`,
    upstreamPathPrefix,
  }
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
      entries.push(
        viteProxyEntryFromBaseUrl(
          `${ESPLORA_SAME_ORIGIN_PROXY_PREFIX}/${providerId}/${network}`,
          baseUrl,
        ),
      )
    }
  }
  entries.push(
    viteProxyEntryFromBaseUrl(
      REGTEST_ESPLORA_PROXY_LOCAL_PREFIX,
      REGTEST_ESPLORA_UPSTREAM_BASE,
    ),
  )
  return entries
}
