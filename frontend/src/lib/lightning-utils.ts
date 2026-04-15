import { decodeInvoice } from '@getalby/lightning-tools/bolt11'
import type { NetworkMode } from '@/stores/walletStore'

export const LIGHTNING_NETWORK_MODES = ['mainnet', 'testnet', 'signet'] as const

export type LightningNetworkMode = (typeof LIGHTNING_NETWORK_MODES)[number]

const LIGHTNING_SUPPORTED_NETWORKS: ReadonlySet<NetworkMode> = new Set(
  LIGHTNING_NETWORK_MODES,
)

export function isLightningSupported(networkMode: NetworkMode): boolean {
  return LIGHTNING_SUPPORTED_NETWORKS.has(networkMode)
}

/** Default Lightning connection network when opening the connect form for the current app mode. */
export function defaultLightningNetworkForAppMode(
  networkMode: NetworkMode,
): LightningNetworkMode {
  return isLightningSupported(networkMode)
    ? (networkMode as LightningNetworkMode)
    : 'mainnet'
}

/**
 * Maps NIP-47 `get_info.network` to a Bitboard Lightning mode.
 * Returns null for regtest, empty values, or strings Bitboard does not support.
 */
export function lightningNetworkModeFromNip47Network(
  raw: string | undefined,
): LightningNetworkMode | null {
  if (raw == null) return null
  const n = raw.trim().toLowerCase()
  if (n === '') return null
  if (n === 'mainnet' || n === 'bitcoin') return 'mainnet'
  if (n === 'testnet') return 'testnet'
  if (n === 'signet') return 'signet'
  return null
}

const ALL_BOLT11_PREFIXES = ['lnbc', 'lntbs', 'lntb']

export function isValidBolt11Invoice(input: string): boolean {
  const lower = input.toLowerCase()
  return ALL_BOLT11_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/**
 * Infer Lightning chain from BOLT11 human-readable prefix (before bech32 payload).
 * Returns null if the string does not start with a known mainnet/testnet/signet prefix.
 */
export function bolt11NetworkModeFromPrefix(
  paymentRequest: string,
): LightningNetworkMode | null {
  const lower = paymentRequest.toLowerCase()
  if (lower.startsWith('lnbc')) return 'mainnet'
  /** `lntbs` must be checked before `lntb` (prefix overlap). */
  if (lower.startsWith('lntbs')) return 'signet'
  if (lower.startsWith('lntb')) return 'testnet'
  return null
}

/** Decode a BOLT11 payment request; returns null if invalid or undecodable. */
export function tryDecodeBolt11Invoice(paymentRequest: string) {
  return decodeInvoice(paymentRequest)
}

export type DecodedBolt11Invoice = NonNullable<
  ReturnType<typeof tryDecodeBolt11Invoice>
>

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
