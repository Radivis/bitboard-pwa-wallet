import {
  MAX_LIGHTNING_WALLET_LABEL_LENGTH,
  MAX_NWC_CONNECTION_STRING_LENGTH,
} from '@/lib/lightning/lightning-input-limits'
import type { LightningPayment } from '@/lib/lightning/lightning-backend-service'
import { isLightningPaymentPayload } from '@/lib/lightning/lightning-snapshot-payload'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { ARKADE_SUPPORTED_NETWORK_MODES } from '@/lib/arkade/arkade-domain-types'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import type { LightningNetworkMode } from '@/lib/lightning/lightning-utils'
import { LIGHTNING_NETWORK_MODES } from '@/lib/lightning/lightning-utils'

export enum AddressType {
  SegWit = 'segwit',
  Taproot = 'taproot',
}

export type BitcoinNetwork = 'bitcoin' | 'testnet' | 'signet' | 'regtest'

/** Domain wallet summary; map from SQLite via `mapDbWalletToDomain()` at the DB hook boundary. */
export interface WalletSummary {
  walletId: number
  name: string
  createdAt: string
  noMnemonicBackup?: boolean
}

/** Parse a stored / wire string (e.g. SQLite `address_type`) into {@link AddressType}. */
export function parseAddressType(raw: string): AddressType {
  const normalized = raw.trim().toLowerCase()
  if (normalized === AddressType.SegWit) return AddressType.SegWit
  if (normalized === AddressType.Taproot) return AddressType.Taproot
  throw new Error(`Invalid address type: ${raw}`)
}

/** Data for a single descriptor wallet (one network + address type + account combo). Shared with db layer. */
export interface DescriptorWalletData {
  network: BitcoinNetwork
  addressType: AddressType
  accountId: number
  externalDescriptor: string
  internalDescriptor: string
  changeSet: string
  /** True after a full scan has been run for this descriptor wallet at least once. */
  fullScanDone: boolean
  /** ISO timestamp of last successful Esplora sync for this descriptor wallet (non-lab). */
  lastSuccessfulEsploraSyncAt?: string
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
 * One Arkade account: this Bitboard wallet's local partition for one ASP on one network.
 * VTXO state lives in `sdkPersistenceJson` for this account only.
 */
export interface StoredArkadeAccount {
  id: string
  label: string
  networkMode: ArkadeSupportedNetworkMode
  operatorUrl: string
  delegatorUrl?: string
  /** Canonical identity from operator getInfo signer_pk. */
  operatorSignerPkHex: string
  createdAt: string
  lastSessionOpenedAt?: string
  lastSuccessfulOperatorSyncAt?: string
  sdkPersistenceJson?: string
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
  /** Arkade accounts (one blob per ASP on a network). */
  arkadeAccounts: StoredArkadeAccount[]
  /** Active account id per live network for dashboard/session. */
  activeArkadeAccountIdByNetwork: Partial<
    Record<ArkadeSupportedNetworkMode, string>
  >
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

const SUPPORTED_ADDRESS_TYPES: readonly AddressType[] = [
  AddressType.SegWit,
  AddressType.Taproot,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isIso8601Timestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  return Number.isFinite(Date.parse(value))
}

/** Throws when `value` is not a parseable ISO-8601 timestamp string. */
export function assertIso8601LastSuccessfulEsploraSyncAt(value: string): void {
  if (!isIso8601Timestamp(value)) {
    throw new Error(
      'Invalid lastSuccessfulEsploraSyncAt: expected parseable ISO-8601 timestamp',
    )
  }
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

function isStoredArkadeAccount(
  value: unknown,
): value is StoredArkadeAccount {
  if (!isRecord(value)) return false
  const networkOk =
    typeof value.networkMode === 'string' &&
    (ARKADE_SUPPORTED_NETWORK_MODES as readonly string[]).includes(value.networkMode)
  if (!networkOk) return false
  if (!isNonEmptyString(value.id)) return false
  if (typeof value.label !== 'string') return false
  if (!isNonEmptyString(value.operatorUrl)) return false
  if (!isNonEmptyString(value.operatorSignerPkHex)) return false
  if (!isIso8601Timestamp(value.createdAt)) return false
  if (value.delegatorUrl !== undefined && typeof value.delegatorUrl !== 'string') {
    return false
  }
  if (value.lastSessionOpenedAt !== undefined && !isIso8601Timestamp(value.lastSessionOpenedAt)) {
    return false
  }
  if (
    value.lastSuccessfulOperatorSyncAt !== undefined &&
    !isIso8601Timestamp(value.lastSuccessfulOperatorSyncAt)
  ) {
    return false
  }
  if (value.sdkPersistenceJson !== undefined) {
    if (typeof value.sdkPersistenceJson !== 'string') return false
    if (
      new TextEncoder().encode(value.sdkPersistenceJson).byteLength >
      ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES
    ) {
      return false
    }
  }
  return true
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
  const base =
    SUPPORTED_BITCOIN_NETWORKS.includes(value.network as BitcoinNetwork) &&
    SUPPORTED_ADDRESS_TYPES.includes(value.addressType as AddressType) &&
    Number.isInteger(value.accountId) &&
    (value.accountId as number) >= 0 &&
    isNonEmptyString(value.externalDescriptor) &&
    isNonEmptyString(value.internalDescriptor) &&
    isNonEmptyString(value.changeSet) &&
    typeof value.fullScanDone === 'boolean'
  if (!base) return false
  if (value.lastSuccessfulEsploraSyncAt === undefined) return true
  return isIso8601Timestamp(value.lastSuccessfulEsploraSyncAt)
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
  if (!Array.isArray(value.arkadeAccounts)) return false
  if (
    !value.arkadeAccounts.every((row) =>
      isStoredArkadeAccount(row),
    )
  ) {
    return false
  }
  if (
    value.activeArkadeAccountIdByNetwork !== undefined &&
    !isRecord(value.activeArkadeAccountIdByNetwork)
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
  if (!Array.isArray(value.arkadeAccounts)) return false
  if (
    !value.arkadeAccounts.every((row) =>
      isStoredArkadeAccount(row),
    )
  ) {
    return false
  }
  if (
    value.activeArkadeAccountIdByNetwork !== undefined &&
    !isRecord(value.activeArkadeAccountIdByNetwork)
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
    arkadeAccounts: payload.arkadeAccounts,
    activeArkadeAccountIdByNetwork: payload.activeArkadeAccountIdByNetwork,
  }
}

function coalesceNullishArrayField(value: unknown): unknown {
  if (value === undefined || value === null) {
    return []
  }
  return value
}

function sanitizeOptionalObjectArray<T>(
  value: unknown,
  sanitizeRow: (row: unknown) => T | null,
): unknown {
  const coalesced = coalesceNullishArrayField(value)
  if (!Array.isArray(coalesced)) {
    return coalesced
  }
  return coalesced
    .map(sanitizeRow)
    .filter((row): row is T => row != null)
}

function stripOversizedSdkPersistenceJson(row: Record<string, unknown>): Record<string, unknown> {
  if (typeof row.sdkPersistenceJson !== 'string') {
    return row
  }
  const byteLength = new TextEncoder().encode(row.sdkPersistenceJson).byteLength
  if (byteLength <= ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES) {
    return row
  }
  if (import.meta.env.DEV) {
    console.warn(
      `[wallet-secrets] Stripped oversized sdkPersistenceJson (${byteLength} bytes) from Arkade row`,
    )
  }
  const withoutSdkPersistenceJson = { ...row }
  delete withoutSdkPersistenceJson.sdkPersistenceJson
  return withoutSdkPersistenceJson
}

function sanitizeStoredArkadeAccountRow(
  row: unknown,
): StoredArkadeAccount | null {
  if (!isRecord(row)) {
    return null
  }
  const candidates = [row, stripOversizedSdkPersistenceJson(row)]
  for (const candidate of candidates) {
    if (isStoredArkadeAccount(candidate)) {
      return candidate
    }
  }
  if (import.meta.env.DEV) {
    console.warn('[wallet-secrets] Dropping invalid arkadeAccount row', row)
  }
  return null
}

function sanitizeActiveArkadeAccountIdByNetwork(
  value: unknown,
  validAccountIds: ReadonlySet<string>,
): Partial<Record<ArkadeSupportedNetworkMode, string>> {
  if (!isRecord(value) || Array.isArray(value)) {
    return {}
  }
  const sanitized: Partial<Record<ArkadeSupportedNetworkMode, string>> = {}
  for (const [networkMode, arkadeAccountId] of Object.entries(value)) {
    if (
      !(ARKADE_SUPPORTED_NETWORK_MODES as readonly string[]).includes(networkMode) ||
      typeof arkadeAccountId !== 'string' ||
      arkadeAccountId.trim().length === 0 ||
      !validAccountIds.has(arkadeAccountId)
    ) {
      continue
    }
    sanitized[networkMode as ArkadeSupportedNetworkMode] = arkadeAccountId
  }
  return sanitized
}

function pickArkadeAccountsField(raw: Record<string, unknown>): unknown {
  if ('arkadeAccounts' in raw) {
    return raw.arkadeAccounts
  }
  return raw.arkadeOperatorConnections
}

function pickActiveArkadeAccountIdByNetworkField(raw: Record<string, unknown>): unknown {
  if ('activeArkadeAccountIdByNetwork' in raw) {
    return raw.activeArkadeAccountIdByNetwork
  }
  return raw.activeArkadeConnectionIdByNetwork
}

function normalizeWalletSecretsPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  const withoutLegacyKeys = { ...raw }
  delete withoutLegacyKeys.arkadeWallets

  const arkadeAccounts = sanitizeOptionalObjectArray(
    pickArkadeAccountsField(withoutLegacyKeys),
    sanitizeStoredArkadeAccountRow,
  )

  const validAccountIds = new Set(
    Array.isArray(arkadeAccounts)
      ? arkadeAccounts.map((account) => account.id)
      : [],
  )

  delete withoutLegacyKeys.arkadeOperatorConnections
  delete withoutLegacyKeys.activeArkadeConnectionIdByNetwork
  delete withoutLegacyKeys.arkadeAccounts
  delete withoutLegacyKeys.activeArkadeAccountIdByNetwork

  return {
    ...withoutLegacyKeys,
    lightningNwcConnections: coalesceNullishArrayField(
      withoutLegacyKeys.lightningNwcConnections,
    ),
    arkadeAccounts,
    activeArkadeAccountIdByNetwork: sanitizeActiveArkadeAccountIdByNetwork(
      pickActiveArkadeAccountIdByNetworkField(raw),
      validAccountIds,
    ),
  }
}

function describeWalletSecretsPayloadValidationIssues(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['root is not an object']
  }
  const issues: string[] = []
  if ('mnemonic' in value && value.mnemonic !== undefined) {
    issues.push('mnemonic must not appear in payload-only secrets')
  }
  if (!Array.isArray(value.descriptorWallets)) {
    issues.push('descriptorWallets must be an array')
  } else if (
    !value.descriptorWallets.every((descriptorWallet) =>
      isDescriptorWalletData(descriptorWallet),
    )
  ) {
    issues.push('descriptorWallets contains an invalid row')
  }
  if (!Array.isArray(value.lightningNwcConnections)) {
    issues.push('lightningNwcConnections must be an array')
  } else if (
    !value.lightningNwcConnections.every((row) => isStoredNwcLightningConnection(row))
  ) {
    issues.push('lightningNwcConnections contains an invalid row')
  }
  if (!Array.isArray(value.arkadeAccounts)) {
    issues.push('arkadeAccounts must be an array')
  } else if (
    !value.arkadeAccounts.every((row) => isStoredArkadeAccount(row))
  ) {
    issues.push('arkadeAccounts contains an invalid row')
  }
  if (
    value.activeArkadeAccountIdByNetwork !== undefined &&
    !isRecord(value.activeArkadeAccountIdByNetwork)
  ) {
    issues.push('activeArkadeAccountIdByNetwork must be an object')
  }
  return issues
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
    const issues = describeWalletSecretsPayloadValidationIssues(parsed)
    const detail = issues.length > 0 ? `: ${issues.join('; ')}` : ''
    throw new Error(`Invalid wallet secrets payload: schema validation failed${detail}`)
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
    if (!isRecord(parsed) || !isNonEmptyString(parsed.mnemonic)) {
      throw new Error('Invalid wallet secrets: schema validation failed: mnemonic missing or invalid')
    }
    const payloadIssues = describeWalletSecretsPayloadValidationIssues(parsed)
    const detail = payloadIssues.length > 0 ? `: ${payloadIssues.join('; ')}` : ''
    throw new Error(`Invalid wallet secrets: schema validation failed${detail}`)
  }
  return parsed
}
