import { BARK_REGTEST_SERVER_URL } from '@/lib/bark/e2e/bark-regtest-env'
import {
  assertBarkRecordDumpWithinSizeLimit,
  BARK_MAINNET_SERVER_URL,
  BARK_SIGNET_SERVER_URL,
  isBarkReceiveKeyIndex,
  pendingEmergencyClaimFromUnknown,
  type BarkRailNetwork,
  type PendingEmergencyClaim,
  type StoredBarkRail,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

export class BarkFingerprintMismatchError extends Error {
  constructor() {
    super('Bark fingerprint does not match the stored rail')
    this.name = 'BarkFingerprintMismatchError'
  }
}

export function barkServerUrl(network: BarkRailNetwork): string {
  if (network === 'signet') return BARK_SIGNET_SERVER_URL
  if (network === 'regtest') return BARK_REGTEST_SERVER_URL
  return BARK_MAINNET_SERVER_URL
}

function railWithPreservedFields(
  network: BarkRailNetwork,
  existingRail: StoredBarkRail | undefined,
  fingerprint: string,
  receiveKeyIndex: number | undefined,
  recordDump: string | undefined,
): StoredBarkRail {
  const barkRail: StoredBarkRail = {
    serverUrl: barkServerUrl(network),
    fingerprint,
  }
  if (existingRail?.lastSuccessfulSyncAt != null) {
    barkRail.lastSuccessfulSyncAt = existingRail.lastSuccessfulSyncAt
  }
  const nextReceiveKeyIndex = receiveKeyIndex ?? existingRail?.receiveKeyIndex
  if (nextReceiveKeyIndex != null) {
    barkRail.receiveKeyIndex = nextReceiveKeyIndex
  }
  const nextDump = recordDump ?? existingRail?.recordDump
  if (nextDump != null) {
    barkRail.recordDump = nextDump
  }
  const pendingEmergencyClaim = pendingEmergencyClaimFromUnknown(
    existingRail?.pendingEmergencyClaim,
  )
  if (pendingEmergencyClaim != null) {
    barkRail.pendingEmergencyClaim = pendingEmergencyClaim
  }
  return barkRail
}

function payloadWithRail(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
  rail: StoredBarkRail,
): WalletSecretsPayload {
  return {
    ...payload,
    barkRails: {
      ...payload.barkRails,
      [network]: rail,
    },
  }
}

function requireRail(payload: WalletSecretsPayload, network: BarkRailNetwork): StoredBarkRail {
  const existingRail = payload.barkRails?.[network]
  if (existingRail == null) {
    throw new Error('Bark rail is missing')
  }
  return existingRail
}

/**
 * Dump to load when opening one network.
 * An over-cap dump is refused here and left on the payload by parse.
 */
export function recordDumpForOpen(
  payload: WalletSecretsPayload,
  network: BarkRailNetwork,
): string {
  const recordDump = payload.barkRails?.[network]?.recordDump
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
 * and the other network's dump. Pass `receiveKeyIndex` after a reveal or a recovered key.
 * Pass `recordDump` to replace this network's protocol records.
 */
export function applyOpenedBarkRail(params: {
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

  const existingRail = params.payload.barkRails?.[params.network]
  if (
    existingRail != null &&
    existingRail.fingerprint.toLowerCase() !== params.fingerprint.toLowerCase()
  ) {
    throw new BarkFingerprintMismatchError()
  }

  return payloadWithRail(
    params.payload,
    params.network,
    railWithPreservedFields(
      params.network,
      existingRail,
      params.fingerprint,
      params.receiveKeyIndex,
      params.recordDump,
    ),
  )
}

/**
 * Stamps `lastSuccessfulSyncAt` after `Wallet::sync` succeeds.
 * Leaves the fingerprint, receive index, the other network, and Arkade unchanged.
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
  const existingRail = requireRail(params.payload, params.network)
  const rail = railWithPreservedFields(
    params.network,
    existingRail,
    existingRail.fingerprint,
    undefined,
    params.recordDump,
  )
  rail.lastSuccessfulSyncAt = params.syncedAt
  return payloadWithRail(params.payload, params.network, rail)
}

/**
 * Replaces one network's record dump after a protocol write.
 * Leaves the other network's dump and Arkade account objects unchanged.
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
  const existingRail = requireRail(params.payload, params.network)
  const rail = railWithPreservedFields(
    params.network,
    existingRail,
    existingRail.fingerprint,
    params.receiveKeyIndex,
    params.recordDump,
  )
  if (params.lastSuccessfulSyncAt !== undefined) {
    rail.lastSuccessfulSyncAt = params.lastSuccessfulSyncAt
  }
  return payloadWithRail(params.payload, params.network, rail)
}

function assertPendingEmergencyClaim(pending: PendingEmergencyClaim): void {
  if (pendingEmergencyClaimFromUnknown(pending) == null) {
    throw new Error('Bark pending emergency claim is invalid')
  }
}

/**
 * Sets or clears the broadcast claim Bark has not observed yet.
 * Leaves the dump, fingerprint, receive index, and the other network unchanged.
 */
export function applyPendingEmergencyClaim(params: {
  payload: WalletSecretsPayload
  network: BarkRailNetwork
  pending: PendingEmergencyClaim | null
}): WalletSecretsPayload {
  if (params.pending != null) {
    assertPendingEmergencyClaim(params.pending)
  }
  const existingRail = requireRail(params.payload, params.network)
  const rail = railWithPreservedFields(
    params.network,
    existingRail,
    existingRail.fingerprint,
    undefined,
    undefined,
  )
  if (params.pending == null) {
    delete rail.pendingEmergencyClaim
  } else {
    rail.pendingEmergencyClaim = {
      txid: params.pending.txid,
      vtxoIds: [...params.pending.vtxoIds],
    }
  }
  return payloadWithRail(params.payload, params.network, rail)
}
