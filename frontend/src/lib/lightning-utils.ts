import type { NetworkMode } from '@/stores/walletStore'

export interface ChannelTarget {
  nodeId: string
  alias: string
  host: string
}

const LIGHTNING_SUPPORTED_NETWORKS: ReadonlySet<NetworkMode> = new Set([
  'mainnet',
  'testnet',
  'signet',
])

export function isLightningSupported(networkMode: NetworkMode): boolean {
  return LIGHTNING_SUPPORTED_NETWORKS.has(networkMode)
}

const BOLT11_PREFIX_BY_NETWORK: Record<string, string> = {
  mainnet: 'lnbc',
  testnet: 'lntb',
  signet: 'lntbs',
}

export function getBolt11Prefix(networkMode: NetworkMode): string {
  return BOLT11_PREFIX_BY_NETWORK[networkMode] ?? 'lntb'
}

/**
 * Generates a mock BOLT11-style invoice string for Phase 1 UI display.
 * Not a valid BOLT11 invoice -- purely for QR rendering and copy/paste UX.
 */
export function generateMockBolt11Invoice(params: {
  networkMode: NetworkMode
  amountSats: number
  description: string
  expirySeconds: number
}): string {
  const prefix = getBolt11Prefix(params.networkMode)
  const amountMsat = params.amountSats * 1000
  const timestamp = Math.floor(Date.now() / 1000)
  const randomSuffix = generateRandomHex(52)
  return `${prefix}${amountMsat}m1p${timestamp}${randomSuffix}`
}

function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

const ALL_BOLT11_PREFIXES = ['lnbc', 'lntbs', 'lntb']

export function isValidBolt11Invoice(input: string): boolean {
  const lower = input.toLowerCase()
  return ALL_BOLT11_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

const LIGHTNING_ADDRESS_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function isLightningAddress(input: string): boolean {
  return LIGHTNING_ADDRESS_PATTERN.test(input)
}

export function isValidLightningDestination(input: string): boolean {
  return isValidBolt11Invoice(input) || isLightningAddress(input)
}

/**
 * Strips the `lightning:` URI prefix if present, similar to how the send page
 * strips `bitcoin:` for on-chain addresses.
 */
export function normalizeLightningDestination(input: string): string {
  return input.trim().replace(/^lightning:/i, '')
}

const MAINNET_CHANNEL_TARGETS: ChannelTarget[] = [
  {
    nodeId: '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f',
    alias: 'ACINQ',
    host: 'node.acinq.co:9735',
  },
  {
    nodeId: '02f1a8c87607f415c8f22c00571c53a346a6a4b60b08a89c55f35e7e0d5a4b5168',
    alias: 'WalletOfSatoshi',
    host: 'walletofsatoshi.com:9735',
  },
  {
    nodeId: '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226',
    alias: 'Kraken',
    host: 'kraken.com:9735',
  },
]

const TESTNET_CHANNEL_TARGETS: ChannelTarget[] = [
  {
    nodeId: '0270685ca81a8e4d4d01beec5781f4cc924684072ae52c507f8ebe9daf0caaab7b',
    alias: 'LND Testnet',
    host: 'testnet-lnd.example.com:9735',
  },
  {
    nodeId: '038863cf8ab91046230f561cd5b386cbff8309fa02e3f0c3ed161a3aeb64a643b9',
    alias: 'Eclair Testnet',
    host: 'testnet-eclair.example.com:9735',
  },
]

const SIGNET_CHANNEL_TARGETS: ChannelTarget[] = [
  {
    nodeId: '0395033b252c6f40e3756984162d68174e2bd127587d1a8b5a53170ee3e252c301',
    alias: 'Mutinynet Signet',
    host: 'signet.example.com:9735',
  },
  {
    nodeId: '024bfaf0cabe7f874fd33ebf7c6f4e5385971fc504ef3f492432e9e3ec77e1b5cf',
    alias: 'CLN Signet',
    host: 'signet-cln.example.com:9735',
  },
]

const CHANNEL_TARGETS_BY_NETWORK: Partial<Record<NetworkMode, ChannelTarget[]>> = {
  mainnet: MAINNET_CHANNEL_TARGETS,
  testnet: TESTNET_CHANNEL_TARGETS,
  signet: SIGNET_CHANNEL_TARGETS,
}

export function getChannelTargets(networkMode: NetworkMode): ChannelTarget[] {
  return CHANNEL_TARGETS_BY_NETWORK[networkMode] ?? []
}

export const DEFAULT_FUNDING_AMOUNT_SATS = 10_000

export type InvoiceExpiryOption = {
  label: string
  seconds: number
}

export const INVOICE_EXPIRY_OPTIONS: InvoiceExpiryOption[] = [
  { label: '10 minutes', seconds: 600 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
]

export const DEFAULT_INVOICE_EXPIRY_SECONDS = 3600

export function formatSatsCompact(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M sats`
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}k sats`
  return `${sats} sats`
}
