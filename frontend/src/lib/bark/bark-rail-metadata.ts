import {
  BARK_SIGNET_SERVER_URL,
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
 */
export function applyOpenedBarkRail(params: {
  payload: WalletSecretsPayload
  fingerprint: string
}): WalletSecretsPayload {
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

  return {
    ...params.payload,
    barkRail,
  }
}
