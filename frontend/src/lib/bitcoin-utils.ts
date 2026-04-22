import type { NetworkMode } from '@/stores/walletStore'
import type { BitcoinNetwork, TransactionDetails } from '@/workers/crypto-types'

export const DEFAULT_ESPLORA_URLS: Record<NetworkMode, string> = {
  lab: '', // In-app chain; no Esplora
  regtest: 'http://localhost:3002',
  /** Mutinynet — preferred for Lightning testing (fast blocks, shared infra). */
  signet: 'https://mutinynet.com/api',
  testnet: 'https://mempool.space/testnet4/api',
  mainnet: 'https://mempool.space/api',
}

/** Max allowed difference between NWC `get_info` block height and Esplora tip before flagging. */
export const NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE = 100

/**
 * Fetches the current chain tip height from an Esplora-style HTTP API.
 * @see https://github.com/Blockstream/esplora/blob/master/API.md
 */
export async function fetchEsploraTipBlockHeight(
  esploraBaseUrl: string,
): Promise<number> {
  const base = esploraBaseUrl.replace(/\/$/, '')
  const url = `${base}/blocks/tip/height`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Esplora tip height failed: HTTP ${res.status}`)
  }
  const text = (await res.text()).trim()
  const height = parseInt(text, 10)
  if (!Number.isFinite(height) || height < 0) {
    throw new Error('Esplora returned an invalid tip height')
  }
  return height
}

const DEV_ESPLORA_PROXY_PATHS: Partial<Record<NetworkMode, string>> = {
  signet: '/esplora-proxy/signet',
  testnet: '/esplora-proxy/testnet',
  mainnet: '/esplora-proxy/mainnet',
}

const NETWORK_MODE_TO_BITCOIN: Record<NetworkMode, BitcoinNetwork> = {
  lab: 'regtest',
  mainnet: 'bitcoin',
  testnet: 'testnet',
  signet: 'signet',
  regtest: 'regtest',
}

export function toBitcoinNetwork(mode: NetworkMode): BitcoinNetwork {
  return NETWORK_MODE_TO_BITCOIN[mode]
}

/** Satoshis per 1 BTC (consensus). */
export const SATS_PER_BTC = 100_000_000

/** Upper bound for sat amounts passed through JS (safe integer range). */
export const MAX_SAFE_SATS = Number.MAX_SAFE_INTEGER

export function formatBTC(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8)
}

/**
 * Formats a satoshi amount as a base-10 integer string: plain digits, no thousands
 * grouping and no fraction part. Sats are indivisible on-chain; any float is floored
 * (sub-sat or Lightning-fractional display is out of scope until needed).
 */
export function formatSats(sats: number): string {
  if (!Number.isFinite(sats) || sats < 0) {
    return '0'
  }
  return String(Math.floor(Math.min(sats, MAX_SAFE_SATS)))
}

/**
 * Parses a BTC amount string to satoshis. Returns 0 for invalid or negative
 * input; clamps to MAX_SAFE_INTEGER to avoid overflow.
 */
export function parseBTC(btcString: string): number {
  if (typeof btcString !== 'string' || btcString.trim() === '') {
    return 0;
  }
  const parsed = parseFloat(btcString);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  const sats = parsed * SATS_PER_BTC;
  const floored = Math.floor(sats);
  return Math.min(floored, MAX_SAFE_SATS);
}

const ADDRESS_PREFIXES: Record<NetworkMode, string[]> = {
  mainnet: ['bc1p', 'bc1q', '1', '3'],
  testnet: ['tb1p', 'tb1q', 'm', 'n', '2'],
  signet: ['tb1p', 'tb1q'],
  regtest: ['bcrt1p', 'bcrt1q'],
  lab: ['bcrt1q', 'bcrt1p'],
}

export function isValidAddress(address: string, network: NetworkMode): boolean {
  const prefixes = ADDRESS_PREFIXES[network]
  return prefixes.some((prefix) => address.startsWith(prefix))
}

/**
 * Validates an Esplora endpoint URL.
 * - Must be a valid URL
 * - Non-regtest networks require HTTPS
 *
 * @throws {Error} If the URL is invalid
 */
export function validateEsploraUrl(url: string, networkMode: NetworkMode): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('URL must use http or https')
    }
    if (networkMode !== 'regtest' && networkMode !== 'lab' && parsed.protocol !== 'https:') {
      throw new Error(
        `${networkMode} requires HTTPS. Use https:// for your Esplora endpoint.`,
      )
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Invalid URL', { cause: err })
    }
    throw err
  }
}

export function getEsploraUrl(
  network: NetworkMode,
  customUrl?: string | null,
): string {
  if (network === 'lab') {
    return '' // In-app chain; no Esplora
  }
  if (customUrl) return customUrl

  if (import.meta.env.DEV) {
    const proxyPath = DEV_ESPLORA_PROXY_PATHS[network]
    if (proxyPath) {
      return `${globalThis.location.origin}${proxyPath}`
    }
  }

  return DEFAULT_ESPLORA_URLS[network]
}

export function truncateAddress(
  address: string,
  prefixLen = 8,
  suffixLen = 8,
): string {
  if (address.length <= prefixLen + suffixLen) return address
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`
}

export function formatTxDirection(tx: TransactionDetails): 'sent' | 'received' {
  return tx.sent_sats > tx.received_sats ? 'sent' : 'received'
}

export function getTxAmount(tx: TransactionDetails): number {
  return Math.abs(tx.sent_sats - tx.received_sats)
}
