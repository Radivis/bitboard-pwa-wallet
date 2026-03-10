import type { NetworkMode } from '@/stores/walletStore'
import type { BitcoinNetwork, TransactionDetails } from '@/workers/crypto-types'

export const DEFAULT_ESPLORA_URLS: Record<NetworkMode, string> = {
  'personal-regtest': '', // In-app chain; no Esplora
  regtest: 'http://localhost:3002',
  signet: 'https://mempool.space/signet/api',
  testnet: 'https://mempool.space/testnet/api',
  mainnet: 'https://mempool.space/api',
}

const DEV_ESPLORA_PROXY_PATHS: Partial<Record<NetworkMode, string>> = {
  signet: '/esplora-proxy/signet',
  testnet: '/esplora-proxy/testnet',
  mainnet: '/esplora-proxy/mainnet',
}

const NETWORK_MODE_TO_BITCOIN: Record<NetworkMode, BitcoinNetwork> = {
  'personal-regtest': 'regtest',
  mainnet: 'bitcoin',
  testnet: 'testnet',
  signet: 'signet',
  regtest: 'regtest',
}

export function toBitcoinNetwork(mode: NetworkMode): BitcoinNetwork {
  return NETWORK_MODE_TO_BITCOIN[mode]
}

export function formatBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8)
}

export function formatSats(sats: number): string {
  return sats.toLocaleString()
}

export function parseBTC(btcString: string): number {
  return Math.floor(parseFloat(btcString) * 100_000_000)
}

const ADDRESS_PREFIXES: Record<NetworkMode, string[]> = {
  mainnet: ['bc1p', 'bc1q', '1', '3'],
  testnet: ['tb1p', 'tb1q', 'm', 'n', '2'],
  signet: ['tb1p', 'tb1q'],
  regtest: ['bcrt1p', 'bcrt1q'],
  'personal-regtest': ['bcrt1q'], // P2WPKH only
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
    if (networkMode !== 'regtest' && networkMode !== 'personal-regtest' && parsed.protocol !== 'https:') {
      throw new Error(
        `${networkMode} requires HTTPS. Use https:// for your Esplora endpoint.`,
      )
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Invalid URL')
    }
    throw err
  }
}

export function getEsploraUrl(
  network: NetworkMode,
  customUrl?: string | null,
): string {
  if (network === 'personal-regtest') {
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
