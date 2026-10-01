import {
  assertBarkRecordDumpWithinSizeLimit,
  BARK_SIGNET_SERVER_URL,
  isBarkReceiveKeyIndex,
  type StoredBarkRail,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

export class BarkFingerprintMismatchError extends Error {
  constructor() {
    super('Bark fingerprint does not match the stored rail')
    this.name = 'BarkFingerprintMismatchError'
  }
}

function signetRailWithPreservedFields(
  existingRail: StoredBarkRail | undefined,
  fingerprint: string,
  receiveKeyIndex: number | undefined,
  recordDump: string | undefined,
): StoredBarkRail {
  const barkRail: StoredBarkRail = {
    serverUrl: BARK_SIGNET_SERVER_URL,
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
  return barkRail
}

function payloadWithSignetRail(
  payload: WalletSecretsPayload,
  signet: StoredBarkRail,
): WalletSecretsPayload {
  return {
    ...payload,
    barkRails: {
      ...payload.barkRails,
      signet,
    },
  }
}

function requireSignetRail(payload: WalletSecretsPayload): StoredBarkRail {
  const existingRail = payload.barkRails?.signet
  if (existingRail == null) {
    throw new Error('Bark rail is missing')
  }
  return existingRail
}

/**
 * Dump to load on Signet open.
 * An over-cap dump is refused here and left on the payload by parse.
 */
export function signetRecordDumpForOpen(payload: WalletSecretsPayload): string {
  const recordDump = payload.barkRails?.signet?.recordDump
  if (recordDump == null || recordDump.length === 0) return ''
  assertBarkRecordDumpWithinSizeLimit(recordDump)
  return recordDump
}

/**
 * Records a successful Signet open. Keeps an existing sync timestamp and the
 * other network's dump. Pass `receiveKeyIndex` after a reveal or a recovered key.
 * Pass `recordDump` to replace this network's protocol records.
 */
export function applyOpenedBarkRail(params: {
  payload: WalletSecretsPayload
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

  const existingRail = params.payload.barkRails?.signet
  if (
    existingRail != null &&
    existingRail.fingerprint.toLowerCase() !== params.fingerprint.toLowerCase()
  ) {
    throw new BarkFingerprintMismatchError()
  }

  return payloadWithSignetRail(
    params.payload,
    signetRailWithPreservedFields(
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
  const existingRail = requireSignetRail(params.payload)
  const signet = signetRailWithPreservedFields(
    existingRail,
    existingRail.fingerprint,
    undefined,
    params.recordDump,
  )
  signet.lastSuccessfulSyncAt = params.syncedAt
  return payloadWithSignetRail(params.payload, signet)
}

/**
 * Replaces the Signet record dump after a protocol write.
 * Leaves the Mainnet dump and Arkade account objects unchanged.
 */
export function applyBarkRecordDump(params: {
  payload: WalletSecretsPayload
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
  const existingRail = requireSignetRail(params.payload)
  const signet = signetRailWithPreservedFields(
    existingRail,
    existingRail.fingerprint,
    params.receiveKeyIndex,
    params.recordDump,
  )
  if (params.lastSuccessfulSyncAt !== undefined) {
    signet.lastSuccessfulSyncAt = params.lastSuccessfulSyncAt
  }
  return payloadWithSignetRail(params.payload, signet)
}
