import {
  MAX_LIGHTNING_WALLET_LABEL_LENGTH,
  MAX_NWC_CONNECTION_STRING_LENGTH,
} from '@/lib/lightning-input-limits'
import type { LightningPayment } from '@/lib/lightning-backend-service'
import { isLightningPaymentPayload } from '@/lib/lightning-snapshot-payload'
import type { LightningNetworkMode } from '@/lib/lightning-utils'
import { LIGHTNING_NETWORK_MODES } from '@/lib/lightning-utils'

export type AddressType = 'taproot' | 'segwit'
export type BitcoinNetwork = 'bitcoin' | 'testnet' | 'signet' | 'regtest'

/** Data for a single descriptor wallet (one network + address type + account combo). Shared with db layer. */
export interface DescriptorWalletData {
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  externalDescriptor: string
  internalDescriptor: string
  changeSet: string
  /** True after a full scan has been run for this sub-wallet at least once. */
  fullScanDone: boolean
}

/**
 * Cached NWC balance and payment list (encrypted inside wallet secrets).
 * Fields are grouped: balance pair and/or payments pair may be present.
 */
export interface NwcConnectionSnapshot {
  balanceSats: number
  balanceUpdatedAt: string
  payments: LightningPayment[]
  paymentsUpdatedAt: string
}

/**
 * NWC connection persisted inside the encrypted wallet secrets blob (not in plain settings).
 * Same fields as UI `ConnectedLightningWallet` minus redundant `walletId`.
 */
export interface StoredNwcLightningConnection {
  id: string
  label: string
  networkMode: LightningNetworkMode
  /** Full `nostr+walletconnect://…` URI including secret. */
  connectionString: string
  createdAt: string
  /** Last successful NWC balance / payment list sync stored in this app (encrypted). */
  nwcSnapshot?: NwcConnectionSnapshot
}

/**
 * Encrypted wallet payload without the mnemonic (descriptor state + Lightning).
 * Stored in the main `encrypted_data` column after split migration.
 */
export interface WalletSecretsPayload {
  descriptorWallets: DescriptorWalletData[]
  /** NWC URIs and metadata (empty array when the user has no Lightning connections). */
  lightningNwcConnections: StoredNwcLightningConnection[]
}

/** Sensitive wallet data stored encrypted. Shared with db layer and workers. */
export interface WalletSecrets extends WalletSecretsPayload {
  mnemonic: string
}

const SUPPORTED_BITCOIN_NETWORKS: readonly BitcoinNetwork[] = [
  'bitcoin',
  'testnet',
  'signet',
  'regtest',
]

const SUPPORTED_ADDRESS_TYPES: readonly AddressType[] = ['taproot', 'segwit']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isLightningNetworkMode(value: unknown): value is LightningNetworkMode {
  return (
    typeof value === 'string' &&
    (LIGHTNING_NETWORK_MODES as readonly string[]).includes(value)
  )
}

function isNwcConnectionSnapshot(value: unknown): value is NwcConnectionSnapshot {
  if (!isRecord(value)) return false
  return (
    typeof value.balanceSats === 'number' &&
    Number.isFinite(value.balanceSats) &&
    typeof value.balanceUpdatedAt === 'string' &&
    value.balanceUpdatedAt.length > 0 &&
    Array.isArray(value.payments) &&
    value.payments.every((p) => isLightningPaymentPayload(p)) &&
    typeof value.paymentsUpdatedAt === 'string' &&
    value.paymentsUpdatedAt.length > 0
  )
}

function isStoredNwcLightningConnection(
  value: unknown,
): value is StoredNwcLightningConnection {
  if (!isRecord(value)) return false
  const base =
    isNonEmptyString(value.id) &&
    typeof value.label === 'string' &&
    value.label.length <= MAX_LIGHTNING_WALLET_LABEL_LENGTH &&
    isLightningNetworkMode(value.networkMode) &&
    typeof value.connectionString === 'string' &&
    value.connectionString.length > 0 &&
    value.connectionString.length <= MAX_NWC_CONNECTION_STRING_LENGTH &&
    typeof value.createdAt === 'string'
  if (!base) return false
  if (value.nwcSnapshot === undefined) return true
  return isNwcConnectionSnapshot(value.nwcSnapshot)
}

function isDescriptorWalletData(value: unknown): value is DescriptorWalletData {
  if (!isRecord(value)) return false
  return (
    SUPPORTED_BITCOIN_NETWORKS.includes(value.network as BitcoinNetwork) &&
    SUPPORTED_ADDRESS_TYPES.includes(value.addressType as AddressType) &&
    Number.isInteger(value.accountId) &&
    (value.accountId as number) >= 0 &&
    isNonEmptyString(value.externalDescriptor) &&
    isNonEmptyString(value.internalDescriptor) &&
    isNonEmptyString(value.changeSet) &&
    typeof value.fullScanDone === 'boolean'
  )
}

export function isWalletSecretsPayload(value: unknown): value is WalletSecretsPayload {
  if (!isRecord(value)) return false
  if ('mnemonic' in value && (value as { mnemonic?: unknown }).mnemonic !== undefined) {
    return false
  }
  if (!Array.isArray(value.descriptorWallets)) return false
  if (
    !value.descriptorWallets.every((descriptorWallet) =>
      isDescriptorWalletData(descriptorWallet),
    )
  ) {
    return false
  }
  if (!Array.isArray(value.lightningNwcConnections)) return false
  if (
    !value.lightningNwcConnections.every((row) =>
      isStoredNwcLightningConnection(row),
    )
  ) {
    return false
  }
  return true
}

export function isWalletSecrets(value: unknown): value is WalletSecrets {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.mnemonic)) return false
  if (!Array.isArray(value.descriptorWallets)) return false
  if (
    !value.descriptorWallets.every((descriptorWallet) =>
      isDescriptorWalletData(descriptorWallet),
    )
  ) {
    return false
  }
  if (!Array.isArray(value.lightningNwcConnections)) return false
  if (
    !value.lightningNwcConnections.every((row) =>
      isStoredNwcLightningConnection(row),
    )
  ) {
    return false
  }
  return true
}

export function assembleWalletSecrets(
  mnemonic: string,
  payload: WalletSecretsPayload,
): WalletSecrets {
  return {
    mnemonic,
    descriptorWallets: payload.descriptorWallets,
    lightningNwcConnections: payload.lightningNwcConnections,
  }
}

function normalizeWalletSecretsPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  if (raw.lightningNwcConnections === undefined) {
    return { ...raw, lightningNwcConnections: [] }
  }
  return raw
}

export function parseWalletPayloadJson(walletSecretsJson: string): WalletSecretsPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(walletSecretsJson)
  } catch {
    throw new Error('Invalid wallet secrets payload: not valid JSON')
  }
  parsed = normalizeWalletSecretsPayload(parsed)
  if (!isWalletSecretsPayload(parsed)) {
    throw new Error('Invalid wallet secrets payload: schema validation failed')
  }
  return parsed
}

export function parseWalletSecretsJson(walletSecretsJson: string): WalletSecrets {
  let parsed: unknown
  try {
    parsed = JSON.parse(walletSecretsJson)
  } catch {
    throw new Error('Invalid wallet secrets: not valid JSON')
  }
  parsed = normalizeWalletSecretsPayload(parsed)
  if (!isWalletSecrets(parsed)) {
    throw new Error('Invalid wallet secrets: schema validation failed')
  }
  return parsed
}
