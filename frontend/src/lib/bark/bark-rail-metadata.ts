import { BARK_REGTEST_SERVER_URL } from '@/lib/bark/e2e/bark-regtest-env'
import {
  assertBarkRecordEnvelopeWithinSizeLimit,
  BARK_MAINNET_SERVER_URL,
  BARK_SIGNET_SERVER_URL,
  isBarkReceiveKeyIndex,
  emergencyExitFeePresetFromUnknown,
  emergencyExitMaxFeeRateFromUnknown,
  seizureVtxoIdsFromUnknown,
  pendingEmergencyClaimFromUnknown,
  proceedAutomaticallyFromUnknown,
  type BarkEmergencyExitFeePreset,
  type BarkRailNetwork,
  type PendingEmergencyClaim,
  type StoredBarkAccount,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import type { BarkExitChainNoticeKind } from '@/lib/bark/bark-exit-seizure'

export class BarkFingerprintMismatchError extends Error {
  constructor() {
    super('Bark fingerprint does not match the stored account')
    this.name = 'BarkFingerprintMismatchError'
  }
}

export function barkServerUrl(network: BarkRailNetwork): string {
  if (network === 'signet') return BARK_SIGNET_SERVER_URL
  if (network === 'regtest') return BARK_REGTEST_SERVER_URL
  return BARK_MAINNET_SERVER_URL
}

export function findBarkAccount(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
): StoredBarkAccount | undefined {
  return payload.barkAccounts.find((account) => account.networkMode === network)
}

export function requireBarkAccount(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
): StoredBarkAccount {
  const account = findBarkAccount(payload, network)
  if (account == null) {
    throw new Error('Bark account is missing')
  }
  return account
}

export function upsertBarkAccountInPayload(
  payload: WalletSecretsPayload,
  account: StoredBarkAccount,
): WalletSecretsPayload {
  const index = payload.barkAccounts.findIndex((a) => a.networkMode === account.networkMode)
  const nextAccounts = [...payload.barkAccounts]
  if (index >= 0) {
    nextAccounts[index] = account
  } else {
    nextAccounts.push(account)
  }
  return {
    ...payload,
    barkAccounts: nextAccounts,
  }
}

function accountWithPreservedFields(
  network: BarkRailNetwork,
  existingAccount: StoredBarkAccount | undefined,
  fingerprint: string,
  receiveKeyIndex: number | undefined,
  recordEnvelope: string | undefined,
): StoredBarkAccount {
  const barkAccount: StoredBarkAccount = {
    id: existingAccount?.id ?? crypto.randomUUID(),
    networkMode: network,
    serverUrl: barkServerUrl(network),
    fingerprint,
  }
  if (existingAccount?.lastSuccessfulSyncAt != null) {
    barkAccount.lastSuccessfulSyncAt = existingAccount.lastSuccessfulSyncAt
  }
  const nextReceiveKeyIndex = receiveKeyIndex ?? existingAccount?.receiveKeyIndex
  if (nextReceiveKeyIndex != null) {
    barkAccount.receiveKeyIndex = nextReceiveKeyIndex
  }
  const nextEnvelope = recordEnvelope ?? existingAccount?.recordEnvelope
  if (nextEnvelope != null) {
    barkAccount.recordEnvelope = nextEnvelope
  }
  const pendingEmergencyClaim = pendingEmergencyClaimFromUnknown(
    existingAccount?.pendingEmergencyClaim,
  )
  if (pendingEmergencyClaim != null) {
    barkAccount.pendingEmergencyClaim = pendingEmergencyClaim
  }
  if (proceedAutomaticallyFromUnknown(existingAccount?.proceedAutomatically) === true) {
    barkAccount.proceedAutomatically = true
  }
  const emergencyExitFeePreset = emergencyExitFeePresetFromUnknown(
    existingAccount?.emergencyExitFeePreset,
  )
  if (emergencyExitFeePreset != null) {
    barkAccount.emergencyExitFeePreset = emergencyExitFeePreset
  }
  const emergencyExitMaxFeeRateSatPerVb = emergencyExitMaxFeeRateFromUnknown(
    existingAccount?.emergencyExitMaxFeeRateSatPerVb,
  )
  if (emergencyExitMaxFeeRateSatPerVb != null) {
    barkAccount.emergencyExitMaxFeeRateSatPerVb = emergencyExitMaxFeeRateSatPerVb
  }
  const exitAnchorSweepVtxoIds = seizureVtxoIdsFromUnknown(existingAccount?.exitAnchorSweepVtxoIds)
  if (exitAnchorSweepVtxoIds != null) {
    barkAccount.exitAnchorSweepVtxoIds = exitAnchorSweepVtxoIds
  }
  const exitCheckpointSeizureVtxoIds = seizureVtxoIdsFromUnknown(
    existingAccount?.exitCheckpointSeizureVtxoIds,
  )
  if (exitCheckpointSeizureVtxoIds != null) {
    barkAccount.exitCheckpointSeizureVtxoIds = exitCheckpointSeizureVtxoIds
  }
  return barkAccount
}

/**
 * Envelope to load when opening one network.
 * An over-cap envelope is refused here and left on the payload by parse.
 */
export function recordEnvelopeForOpen(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
): string {
  const recordEnvelope = findBarkAccount(payload, network)?.recordEnvelope
  if (recordEnvelope == null || recordEnvelope.length === 0) return ''
  assertBarkRecordEnvelopeWithinSizeLimit(recordEnvelope)
  return recordEnvelope
}

/** Signet envelope. Prefer [`recordEnvelopeForOpen`] when the network is a parameter. */
export function signetRecordEnvelopeForOpen(payload: WalletSecretsPayload): string {
  return recordEnvelopeForOpen(payload, 'signet')
}

/**
 * Records a successful open for one network. Keeps an existing sync timestamp
 * and other network accounts. Pass `receiveKeyIndex` after a reveal or a recovered key.
 * Pass `recordEnvelope` to replace this network's protocol records.
 */
export function applyOpenedBarkAccount(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  fingerprint: string
  receiveKeyIndex?: number
  recordEnvelope?: string
}): WalletSecretsPayload {
  if (
    params.receiveKeyIndex !== undefined &&
    !isBarkReceiveKeyIndex(params.receiveKeyIndex)
  ) {
    throw new Error('Bark receive key index is invalid')
  }
  if (params.recordEnvelope !== undefined) {
    if (params.recordEnvelope.length === 0) {
      throw new Error('Bark record envelope is empty')
    }
    assertBarkRecordEnvelopeWithinSizeLimit(params.recordEnvelope)
  }

  const existingAccount = findBarkAccount(params.payload, params.network)
  if (
    existingAccount != null &&
    existingAccount.fingerprint.toLowerCase() !== params.fingerprint.toLowerCase()
  ) {
    throw new BarkFingerprintMismatchError()
  }

  return upsertBarkAccountInPayload(
    params.payload,
    accountWithPreservedFields(
      params.network,
      existingAccount,
      params.fingerprint,
      params.receiveKeyIndex,
      params.recordEnvelope,
    ),
  )
}

/**
 * Stamps `lastSuccessfulSyncAt` after `Wallet::sync` succeeds.
 * Leaves the fingerprint, receive index, other network accounts, and Arkade unchanged.
 */
export function applySuccessfulBarkSync(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  syncedAt: string
  recordEnvelope?: string
}): WalletSecretsPayload {
  if (!Number.isFinite(Date.parse(params.syncedAt))) {
    throw new Error('Bark sync timestamp must be a parseable ISO-8601 string')
  }
  if (params.recordEnvelope !== undefined) {
    if (params.recordEnvelope.length === 0) {
      throw new Error('Bark record envelope is empty')
    }
    assertBarkRecordEnvelopeWithinSizeLimit(params.recordEnvelope)
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    params.recordEnvelope,
  )
  account.lastSuccessfulSyncAt = params.syncedAt
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Replaces one network's record envelope after a protocol write.
 * Leaves the other network accounts and Arkade account objects unchanged.
 */
export function applyBarkRecordEnvelope(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  recordEnvelope: string
  receiveKeyIndex?: number
  lastSuccessfulSyncAt?: string
}): WalletSecretsPayload {
  if (params.recordEnvelope.length === 0) {
    throw new Error('Bark record envelope is empty')
  }
  assertBarkRecordEnvelopeWithinSizeLimit(params.recordEnvelope)
  if (
    params.receiveKeyIndex !== undefined &&
    !isBarkReceiveKeyIndex(params.receiveKeyIndex)
  ) {
    throw new Error('Bark receive key index is invalid')
  }
  if (
    params.lastSuccessfulSyncAt !== undefined &&
    !Number.isFinite(Date.parse(params.lastSuccessfulSyncAt))
  ) {
    throw new Error('Bark sync timestamp must be a parseable ISO-8601 string')
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    params.receiveKeyIndex,
    params.recordEnvelope,
  )
  if (params.lastSuccessfulSyncAt !== undefined) {
    account.lastSuccessfulSyncAt = params.lastSuccessfulSyncAt
  }
  return upsertBarkAccountInPayload(params.payload, account)
}

function assertPendingEmergencyClaim(pending: PendingEmergencyClaim): void {
  if (pendingEmergencyClaimFromUnknown(pending) == null) {
    throw new Error('Bark pending emergency claim is invalid')
  }
}

/**
 * Sets or clears the broadcast claim Bark has not observed yet.
 * Leaves the envelope, fingerprint, receive index, and other network accounts unchanged.
 */
export function applyPendingEmergencyClaim(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  pending: PendingEmergencyClaim | null
}): WalletSecretsPayload {
  if (params.pending != null) {
    assertPendingEmergencyClaim(params.pending)
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  if (params.pending == null) {
    delete account.pendingEmergencyClaim
  } else {
    account.pendingEmergencyClaim = {
      txid: params.pending.txid,
      vtxoIds: [...params.pending.vtxoIds],
    }
  }
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Turns automatic emergency-exit proceeding on or off for one network.
 * Off deletes the field. A later sync flush keeps an explicit true.
 */
export function applyProceedAutomatically(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  enabled: boolean
}): WalletSecretsPayload {
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  if (params.enabled) {
    account.proceedAutomatically = true
  } else {
    delete account.proceedAutomatically
  }
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Stores the low, medium, or high degree for automatic emergency-exit proceeding.
 * A later sync flush keeps it.
 */
export function applyEmergencyExitFeePreset(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  feePreset: BarkEmergencyExitFeePreset
}): WalletSecretsPayload {
  const feePreset = emergencyExitFeePresetFromUnknown(params.feePreset)
  if (feePreset == null) {
    throw new Error('Emergency exit fee preset must be Low, Medium, or High')
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  account.emergencyExitFeePreset = feePreset
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Stores the maximum sat/vB for automatic emergency-exit proceeding.
 * A later sync flush keeps it.
 */
export function applyEmergencyExitMaxFeeRate(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  maxFeeRateSatPerVb: number
}): WalletSecretsPayload {
  const maxFeeRateSatPerVb = emergencyExitMaxFeeRateFromUnknown(params.maxFeeRateSatPerVb)
  if (maxFeeRateSatPerVb == null) {
    throw new Error('Max fee rate must be a positive number of sat/vB')
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  account.emergencyExitMaxFeeRateSatPerVb = maxFeeRateSatPerVb
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Adds VTXO ids to the sweep list or the seizure list. An empty list leaves that
 * list unchanged. The other list is left in place. A later sync flush keeps both.
 */
export function applyMergedExitChainNotice(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  kind: BarkExitChainNoticeKind
  vtxoIds: readonly string[]
}): WalletSecretsPayload {
  const incoming = seizureVtxoIdsFromUnknown([...params.vtxoIds])
  if (incoming == null) return params.payload
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  const field = noticeField(params.kind)
  account[field] = seizureVtxoIdsFromUnknown([...(account[field] ?? []), ...incoming])
  return upsertBarkAccountInPayload(params.payload, account)
}

/** Removes the sweep list or the seizure list. A later sync flush does not restore it. */
export function applyClearedExitChainNotice(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  kind: BarkExitChainNoticeKind
}): WalletSecretsPayload {
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    undefined,
  )
  delete account[noticeField(params.kind)]
  return upsertBarkAccountInPayload(params.payload, account)
}

function noticeField(
  kind: BarkExitChainNoticeKind,
): 'exitAnchorSweepVtxoIds' | 'exitCheckpointSeizureVtxoIds' {
  return kind === 'sweep' ? 'exitAnchorSweepVtxoIds' : 'exitCheckpointSeizureVtxoIds'
}
