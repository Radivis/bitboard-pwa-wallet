import {
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

/**
 * Records a successful Signet open. Keeps an existing sync timestamp and the
 * Arkade account objects, including `sdkPersistenceJson`, unchanged.
 * Pass `receiveKeyIndex` after a reveal or a recovered key. Omit it to keep the stored index.
 */
export function applyOpenedBarkRail(params: {
  payload: WalletSecretsPayload
  fingerprint: string
  receiveKeyIndex?: number
}): WalletSecretsPayload {
  if (
    params.receiveKeyIndex !== undefined &&
    !isBarkReceiveKeyIndex(params.receiveKeyIndex)
  ) {
    throw new Error('Bark receive key index is invalid')
  }

  const existingRail = params.payload.barkRail
  if (
    existingRail != null &&
    existingRail.fingerprint.toLowerCase() !== params.fingerprint.toLowerCase()
  ) {
    throw new BarkFingerprintMismatchError()
  }

  const barkRail: StoredBarkRail = {
    network: 'signet',
    serverUrl: BARK_SIGNET_SERVER_URL,
    fingerprint: params.fingerprint,
  }
  if (existingRail?.lastSuccessfulSyncAt != null) {
    barkRail.lastSuccessfulSyncAt = existingRail.lastSuccessfulSyncAt
  }
  const receiveKeyIndex = params.receiveKeyIndex ?? existingRail?.receiveKeyIndex
  if (receiveKeyIndex != null) {
    barkRail.receiveKeyIndex = receiveKeyIndex
  }

  return {
    ...params.payload,
    barkRail,
  }
}
