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
import {
  getConfiguredHistoricalSignetOnchainChain,
  historicalSignetOnchainWasMutinynet,
  renameSignetMapKeyToMutinynet,
} from '@/lib/wallet/historical-signet-onchain-chain'
import {
  BARK_REGTEST_SERVER_URL,
  isE2eBarkRegtestControlEnabled,
} from '@/lib/bark/e2e/bark-regtest-env'

export enum AddressType {
  SegWit = 'segwit',
  Taproot = 'taproot',
}

export type BitcoinNetwork = 'bitcoin' | 'testnet' | 'signet' | 'mutinynet' | 'regtest'

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
 * Second's public Signet Ark server.
 * Keep in sync with `BARK_SIGNET_SERVER_URL` in `bitboard-bark/src/lib.rs`.
 */
export const BARK_SIGNET_SERVER_URL = 'https://ark.signet.2nd.dev'

/**
 * Second's public Mainnet Ark server.
 * Keep in sync with `BARK_MAINNET_SERVER_URL` in `bitboard-bark/src/lib.rs`.
 */
export const BARK_MAINNET_SERVER_URL = 'https://ark.second.tech'

const BARK_RAIL_SERVER_URL: Record<BarkRailNetwork, string> = {
  signet: BARK_SIGNET_SERVER_URL,
  mainnet: BARK_MAINNET_SERVER_URL,
  regtest: BARK_REGTEST_SERVER_URL,
}

/** UTF-8 cap for one network's Bark record dump. Same size as an Arkade SDK blob. */
export const BARK_RECORD_DUMP_MAX_BYTES = 10 * 1024 * 1024

export type BarkRailNetwork = 'signet' | 'mainnet' | 'regtest'

const MAX_BARK_RECEIVE_KEY_INDEX = 0xffff_ffff

/** True for a Bark VTXO key index in `0..=u32::MAX`. */
export function isBarkReceiveKeyIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_BARK_RECEIVE_KEY_INDEX
  )
}

/**
 * One Bark account inside encrypted wallet secrets.
 * Protocol records live in `recordDump`.
 */
export interface StoredBarkAccount {
  id: string
  networkMode: BarkRailNetwork
  serverUrl: string
  fingerprint: string
  /** ISO-8601 time of the last successful Bark sync. Open must preserve it and must not invent one. */
  lastSuccessfulSyncAt?: string
  /**
   * Last Bark receive key revealed for this account.
   * Absent until the first reveal. Not Bark's last VTXO key: change keys share that sequence.
   */
  receiveKeyIndex?: number
  /**
   * Versioned Bark `Record` bytes for this network, standard base64.
   * Absent until the first successful open flush. An over-cap dump is kept:
   * dropping it would open an empty wallet and lose the exit chain.
   */
  recordDump?: string
  /**
   * Broadcast claim Bark has not yet observed. Kept until those VTXOs are
   * claim-in-progress or claimed, or the app Esplora reports the transaction gone.
   */
  pendingEmergencyClaim?: PendingEmergencyClaim
  /**
   * When true, the app advances emergency exits on a new chain tip while this
   * wallet stays unlocked on this network. Absent means off.
   */
  proceedAutomatically?: boolean
}

/** A claim transaction already broadcast, and the VTXOs it spends. */
export interface PendingEmergencyClaim {
  txid: string
  vtxoIds: string[]
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
  /** Bark accounts (one account per supported network). */
  barkAccounts: StoredBarkAccount[]
  /**
   * Set once the historical `signet` rows (Mutinynet infrastructure) have been
   * rewritten to `mutinynet`. Absent means the rewrite still needs to run.
   * New wallets set this immediately so public Signet rows stay `signet`.
   */
  signetNetworkSplitApplied?: true
}

/** Sensitive wallet data stored encrypted. Shared with db layer and workers. */
export interface WalletSecrets extends WalletSecretsPayload {
  mnemonic: string
}

const SUPPORTED_BITCOIN_NETWORKS: readonly BitcoinNetwork[] = [
  'bitcoin',
  'testnet',
  'signet',
  'mutinynet',
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

const BARK_FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/i

function isBarkFingerprint(value: unknown): value is string {
  return typeof value === 'string' && BARK_FINGERPRINT_PATTERN.test(value)
}

function isPendingEmergencyClaim(value: unknown): value is PendingEmergencyClaim {
  if (!isRecord(value)) return false
  if (typeof value.txid !== 'string' || value.txid.length === 0) return false
  if (!Array.isArray(value.vtxoIds) || value.vtxoIds.length === 0) return false
  return value.vtxoIds.every((vtxoId) => typeof vtxoId === 'string' && vtxoId.length > 0)
}

/** Keeps a well-formed pending claim. A malformed one is omitted so the dump stays. */
export function pendingEmergencyClaimFromUnknown(
  value: unknown,
): PendingEmergencyClaim | undefined {
  if (!isPendingEmergencyClaim(value)) return undefined
  return { txid: value.txid, vtxoIds: [...value.vtxoIds] }
}

/** Only an explicit true turns automatic proceeding on. Anything else is off. */
export function proceedAutomaticallyFromUnknown(value: unknown): true | undefined {
  return value === true ? true : undefined
}

export function isStoredBarkAccount(value: unknown): value is StoredBarkAccount {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.id)) return false
  const regtestEnabled = isE2eBarkRegtestControlEnabled()
  const allowedNetworks: readonly BarkRailNetwork[] = regtestEnabled
    ? ['signet', 'mainnet', 'regtest']
    : ['signet', 'mainnet']
  if (
    typeof value.networkMode !== 'string' ||
    !allowedNetworks.includes(value.networkMode as BarkRailNetwork)
  ) {
    return false
  }
  const network = value.networkMode as BarkRailNetwork
  if (value.serverUrl !== BARK_RAIL_SERVER_URL[network]) return false
  if (!isBarkFingerprint(value.fingerprint)) return false
  if (value.lastSuccessfulSyncAt !== undefined && !isIso8601Timestamp(value.lastSuccessfulSyncAt)) {
    return false
  }
  if (value.receiveKeyIndex !== undefined && !isBarkReceiveKeyIndex(value.receiveKeyIndex)) {
    return false
  }
  if (value.recordDump !== undefined && typeof value.recordDump !== 'string') {
    return false
  }
  if (
    value.pendingEmergencyClaim !== undefined &&
    !isPendingEmergencyClaim(value.pendingEmergencyClaim)
  ) {
    return false
  }
  if (
    value.proceedAutomatically !== undefined &&
    typeof value.proceedAutomatically !== 'boolean'
  ) {
    return false
  }
  return true
}

function sanitizeStoredBarkAccountRow(row: unknown): StoredBarkAccount | null {
  if (!isRecord(row)) return null
  if (isStoredBarkAccount(row)) {
    return row
  }
  const cleaned: Record<string, unknown> = { ...row }
  const pendingEmergencyClaim = pendingEmergencyClaimFromUnknown(row.pendingEmergencyClaim)
  if (pendingEmergencyClaim != null) {
    cleaned.pendingEmergencyClaim = pendingEmergencyClaim
  } else {
    delete cleaned.pendingEmergencyClaim
  }
  if (proceedAutomaticallyFromUnknown(row.proceedAutomatically) === true) {
    cleaned.proceedAutomatically = true
  } else {
    delete cleaned.proceedAutomatically
  }
  if (isStoredBarkAccount(cleaned)) {
    return cleaned
  }
  if (import.meta.env.DEV) {
    console.warn('[wallet-secrets] Dropping invalid barkAccount row', row)
  }
  return null
}

function deduplicateBarkAccountsByNetwork(accounts: StoredBarkAccount[]): StoredBarkAccount[] {
  const seenNetworks = new Set<BarkRailNetwork>()
  const deduplicated: StoredBarkAccount[] = []
  for (const account of accounts) {
    if (seenNetworks.has(account.networkMode)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[wallet-secrets] Dropping duplicate barkAccount for network',
          account.networkMode,
        )
      }
      continue
    }
    seenNetworks.add(account.networkMode)
    deduplicated.push(account)
  }
  return deduplicated
}

/** Throws when a dump is larger than [`BARK_RECORD_DUMP_MAX_BYTES`]. Does not modify the dump. */
export function assertBarkRecordDumpWithinSizeLimit(recordDump: string): void {
  const byteLength = new TextEncoder().encode(recordDump).byteLength
  if (byteLength > BARK_RECORD_DUMP_MAX_BYTES) {
    throw new Error(`Bark record dump exceeds ${BARK_RECORD_DUMP_MAX_BYTES} bytes`)
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
  if (!Array.isArray(value.barkAccounts)) return false
  if (!value.barkAccounts.every((row) => isStoredBarkAccount(row))) {
    return false
  }
  const barkNetworks = new Set<string>()
  for (const account of value.barkAccounts) {
    if (barkNetworks.has(account.networkMode)) return false
    barkNetworks.add(account.networkMode)
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
  if (!Array.isArray(value.barkAccounts)) return false
  if (!value.barkAccounts.every((row) => isStoredBarkAccount(row))) {
    return false
  }
  const barkNetworksSecrets = new Set<string>()
  for (const account of value.barkAccounts) {
    if (barkNetworksSecrets.has(account.networkMode)) return false
    barkNetworksSecrets.add(account.networkMode)
  }
  return true
}

export function walletSecretsPayloadFromSecrets(
  secrets: WalletSecrets | WalletSecretsPayload,
): WalletSecretsPayload {
  return {
    descriptorWallets: secrets.descriptorWallets,
    lightningNwcConnections: secrets.lightningNwcConnections,
    arkadeAccounts: secrets.arkadeAccounts ?? [],
    activeArkadeAccountIdByNetwork: secrets.activeArkadeAccountIdByNetwork ?? {},
    barkAccounts: secrets.barkAccounts ?? [],
    ...(secrets.signetNetworkSplitApplied === true
      ? { signetNetworkSplitApplied: true as const }
      : {}),
  }
}

export function assembleWalletSecrets(
  mnemonic: string,
  payload: WalletSecretsPayload,
): WalletSecrets {
  return {
    mnemonic,
    ...walletSecretsPayloadFromSecrets(payload),
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

function rewriteSignetNetworkField(
  value: unknown,
  field: 'network' | 'networkMode',
): void {
  if (!Array.isArray(value)) return
  for (const row of value) {
    if (isRecord(row) && row[field] === 'signet') {
      row[field] = 'mutinynet'
    }
  }
}

/**
 * Historical Arkade `signet` rows were the Mutinynet operator.
 * On-chain descriptors and Lightning connections move to Mutinynet only when
 * the configured pre-split Esplora chain was Mutinynet. Bark stays on public
 * Signet (`barkAccounts` with `networkMode: 'signet'` is left untouched).
 *
 * Until that chain is configured, Arkade is rewritten but the flag stays unset
 * so a later parse can still classify descriptors.
 */
function applySignetNetworkSplit(raw: Record<string, unknown>): void {
  if (raw.signetNetworkSplitApplied === true) return

  rewriteSignetNetworkField(raw.arkadeAccounts, 'networkMode')
  rewriteSignetNetworkField(raw.arkadeOperatorConnections, 'networkMode')
  renameSignetMapKeyToMutinynet(raw.activeArkadeAccountIdByNetwork)
  renameSignetMapKeyToMutinynet(raw.activeArkadeConnectionIdByNetwork)

  const historicalSignetChain = getConfiguredHistoricalSignetOnchainChain()
  if (historicalSignetChain == null) return

  if (historicalSignetOnchainWasMutinynet(historicalSignetChain)) {
    rewriteSignetNetworkField(raw.descriptorWallets, 'network')
    rewriteSignetNetworkField(raw.lightningNwcConnections, 'networkMode')
  }
  raw.signetNetworkSplitApplied = true
}

function normalizeWalletSecretsPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw

  applySignetNetworkSplit(raw)

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

  delete withoutLegacyKeys.barkRails
  const barkAccountsRaw = withoutLegacyKeys.barkAccounts
  delete withoutLegacyKeys.barkAccounts
  const barkAccounts = deduplicateBarkAccountsByNetwork(
    (sanitizeOptionalObjectArray(
      barkAccountsRaw,
      sanitizeStoredBarkAccountRow,
    ) as StoredBarkAccount[]) ?? [],
  )

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
    barkAccounts,
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
  if (!Array.isArray(value.barkAccounts)) {
    issues.push('barkAccounts must be an array')
  } else if (!value.barkAccounts.every((row) => isStoredBarkAccount(row))) {
    issues.push('barkAccounts contains an invalid row')
  } else {
    const barkNetworks = new Set<string>()
    for (const account of value.barkAccounts) {
      if (barkNetworks.has(account.networkMode)) {
        issues.push(`barkAccounts has duplicate account for network ${account.networkMode}`)
        break
      }
      barkNetworks.add(account.networkMode)
    }
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
