import type { NetworkMode } from '@/stores/walletStore'

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
