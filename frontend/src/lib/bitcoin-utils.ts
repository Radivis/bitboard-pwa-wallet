import type { NetworkMode } from '@/stores/walletStore'
import type { BitcoinNetwork, TransactionDetails } from '@/workers/crypto-types'

export const DEFAULT_ESPLORA_URLS: Record<NetworkMode, string> = {
  regtest: 'http://localhost:3002',
  signet: 'https://mutinynet.ltbl.io/api',
  testnet: 'https://mempool.space/testnet/api',
  mainnet: 'https://mempool.space/api',
}

const NETWORK_MODE_TO_BITCOIN: Record<NetworkMode, BitcoinNetwork> = {
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
}

export function isValidAddress(address: string, network: NetworkMode): boolean {
  const prefixes = ADDRESS_PREFIXES[network]
  return prefixes.some((prefix) => address.startsWith(prefix))
}

export function getEsploraUrl(
  network: NetworkMode,
  customUrl?: string | null,
): string {
  return customUrl || DEFAULT_ESPLORA_URLS[network]
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
