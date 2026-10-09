import { BARK_REGTEST_SERVER_URL } from '@/lib/bark/e2e/bark-regtest-env'
import {
  assertBarkRecordDumpWithinSizeLimit,
  BARK_MAINNET_SERVER_URL,
  BARK_SIGNET_SERVER_URL,
  isBarkReceiveKeyIndex,
  pendingEmergencyClaimFromUnknown,
  proceedAutomaticallyFromUnknown,
  type BarkRailNetwork,
  type PendingEmergencyClaim,
  type StoredBarkAccount,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

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
  recordDump: string | undefined,
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
  const nextDump = recordDump ?? existingAccount?.recordDump
  if (nextDump != null) {
    barkAccount.recordDump = nextDump
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
  return barkAccount
}

/**
 * Dump to load when opening one network.
 * An over-cap dump is refused here and left on the payload by parse.
 */
export function recordDumpForOpen(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
): string {
  const recordDump = findBarkAccount(payload, network)?.recordDump
  if (recordDump == null || recordDump.length === 0) return ''
  assertBarkRecordDumpWithinSizeLimit(recordDump)
  return recordDump
}

/** Signet dump. Prefer [`recordDumpForOpen`] when the network is a parameter. */
export function signetRecordDumpForOpen(payload: WalletSecretsPayload): string {
  return recordDumpForOpen(payload, 'signet')
}

/**
 * Records a successful open for one network. Keeps an existing sync timestamp
 * and other network accounts. Pass `receiveKeyIndex` after a reveal or a recovered key.
 * Pass `recordDump` to replace this network's protocol records.
 */
export function applyOpenedBarkAccount(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  fingerprint: string
  receiveKeyIndex?: number
  recordDump?: string
}): WalletSecretsPayload {
  if (
    params.receiveKeyIndex !== undefined &&
    !isBarkReceiveKeyIndex(params.receiveKeyIndex)
  ) {
    throw new Error('Bark receive key index is invalid')
  }
  if (params.recordDump !== undefined) {
    if (params.recordDump.length === 0) {
      throw new Error('Bark record dump is empty')
    }
    assertBarkRecordDumpWithinSizeLimit(params.recordDump)
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
      params.recordDump,
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
  recordDump?: string
}): WalletSecretsPayload {
  if (!Number.isFinite(Date.parse(params.syncedAt))) {
    throw new Error('Bark sync timestamp must be a parseable ISO-8601 string')
  }
  if (params.recordDump !== undefined) {
    if (params.recordDump.length === 0) {
      throw new Error('Bark record dump is empty')
    }
    assertBarkRecordDumpWithinSizeLimit(params.recordDump)
  }
  const existingAccount = requireBarkAccount(params.payload, params.network)
  const account = accountWithPreservedFields(
    params.network,
    existingAccount,
    existingAccount.fingerprint,
    undefined,
    params.recordDump,
  )
  account.lastSuccessfulSyncAt = params.syncedAt
  return upsertBarkAccountInPayload(params.payload, account)
}

/**
 * Replaces one network's record dump after a protocol write.
 * Leaves the other network accounts and Arkade account objects unchanged.
 */
export function applyBarkRecordDump(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  recordDump: string
  receiveKeyIndex?: number
  lastSuccessfulSyncAt?: string
}): WalletSecretsPayload {
  if (params.recordDump.length === 0) {
    throw new Error('Bark record dump is empty')
  }
  assertBarkRecordDumpWithinSizeLimit(params.recordDump)
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
    params.recordDump,
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
 * Leaves the dump, fingerprint, receive index, and other network accounts unchanged.
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
