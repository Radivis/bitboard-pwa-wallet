/**
 * Before Signet and Mutinynet were separate modes, `signet` meant Mutinynet
 * unless the user had pointed Esplora at another host.
 *
 * `custom-host` is anything other than Mutinynet or a known public-Signet
 * endpoint. Those UTXOs were scanned at that URL, so the row stays `signet`
 * and the custom URL stays on the signet settings key. We do not relabel them
 * Mutinynet.
 */
export type HistoricalSignetOnchainChain = 'mutinynet' | 'public-signet' | 'custom-host'

export const LIVE_NETWORK_SPLIT_ESPLORA_MIGRATED_KEY = 'live_network_split_esplora_migrated'
export const LIVE_NETWORK_SPLIT_ONCHAIN_CHAIN_KEY = 'live_network_split_onchain_chain'
export const CUSTOM_ESPLORA_URL_KEY_PREFIX = 'custom_esplora_url_'
export const SIGNET_ESPLORA_SETTINGS_KEY = `${CUSTOM_ESPLORA_URL_KEY_PREFIX}signet`
export const MUTINYNET_ESPLORA_SETTINGS_KEY = `${CUSTOM_ESPLORA_URL_KEY_PREFIX}mutinynet`

export const WALLET_PERSIST_STORAGE_KEY = 'wallet-storage'
export const LIGHTNING_PERSIST_STORAGE_KEY = 'lightning-storage'

const HISTORICAL_MUTINYNET_DEFAULT_PROXY_PATH = '/api/esplora/default/signet'
const PUBLIC_SIGNET_PROXY_PATHS = [
  '/api/esplora/legacy/signet',
  '/api/esplora/blockstream/signet',
]

let configuredHistoricalSignetOnchainChain: HistoricalSignetOnchainChain | null = null

export function getConfiguredHistoricalSignetOnchainChain(): HistoricalSignetOnchainChain | null {
  return configuredHistoricalSignetOnchainChain
}

export function setConfiguredHistoricalSignetOnchainChain(
  chain: HistoricalSignetOnchainChain | null,
): void {
  configuredHistoricalSignetOnchainChain = chain
}

export function parseHistoricalSignetOnchainChain(
  value: string | null | undefined,
): HistoricalSignetOnchainChain | null {
  if (value === 'mutinynet' || value === 'public-signet' || value === 'custom-host') {
    return value
  }
  return null
}

/**
 * Classifies the pre-split `custom_esplora_url_signet` value.
 * A missing URL is Mutinynet: that was the app default.
 */
export function classifyHistoricalSignetEsplora(
  url: string | null | undefined,
): HistoricalSignetOnchainChain {
  const trimmedUrl = url?.trim() ?? ''
  if (trimmedUrl === '') return 'mutinynet'

  const parsedUrl = parseEsploraUrl(trimmedUrl)
  if (parsedUrl == null) return 'custom-host'
  if (isMutinynetEsplora(parsedUrl)) return 'mutinynet'
  if (isPublicSignetEsplora(parsedUrl)) return 'public-signet'
  return 'custom-host'
}

export function historicalSignetOnchainWasMutinynet(
  chain: HistoricalSignetOnchainChain | null,
): boolean {
  return chain === 'mutinynet'
}

/** Copies a string `signet` entry to `mutinynet` when that key is empty, then drops `signet`. */
export function renameSignetMapKeyToMutinynet(value: unknown): void {
  if (!isStringKeyRecord(value)) return
  if (typeof value.signet === 'string' && value.mutinynet === undefined) {
    value.mutinynet = value.signet
  }
  delete value.signet
}

function parseEsploraUrl(
  urlString: string,
): { hostname: string; pathname: string } | null {
  try {
    const parsedUrl = new URL(urlString)
    let pathname = parsedUrl.pathname.toLowerCase()
    while (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }
    return { hostname: parsedUrl.hostname.toLowerCase(), pathname }
  } catch {
    return null
  }
}

function isMutinynetEsplora(url: { hostname: string; pathname: string }): boolean {
  if (url.hostname === 'mutinynet.com') return true
  return url.pathname === HISTORICAL_MUTINYNET_DEFAULT_PROXY_PATH
}

function isPublicSignetEsplora(url: { hostname: string; pathname: string }): boolean {
  if (url.hostname === 'mempool.space' && url.pathname.includes('/signet')) return true
  if (url.hostname === 'blockstream.info' && url.pathname.includes('/signet')) return true
  return PUBLIC_SIGNET_PROXY_PATHS.some((proxyPath) => url.pathname === proxyPath)
}

function isStringKeyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
