import { getDatabase } from '@/db/database'
import { loadWalletSecretsPayload } from '@/db/wallet-persistence'
import {
  findArkadeOperatorConnection,
  upsertArkadeOperatorConnection,
} from '@/lib/arkade/arkade-operator-connections'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'

export function readOffchainNextDerivationIndex(sdkPersistenceJson: string | undefined): number {
  if (sdkPersistenceJson == null) {
    return 0
  }
  try {
    const parsed = JSON.parse(sdkPersistenceJson) as {
      wallet_db?: { offchain_next_derivation_index?: number }
    }
    return parsed.wallet_db?.offchain_next_derivation_index ?? 0
  } catch {
    return 0
  }
}

/** Keep the blob with the higher receive cursor when concurrent writes race. */
export function mergeSdkPersistenceJsonMonotonic(
  existingJson: string | undefined,
  incomingJson: string,
): string {
  if (existingJson == null) {
    return incomingJson
  }
  const existingIndex = readOffchainNextDerivationIndex(existingJson)
  const incomingIndex = readOffchainNextDerivationIndex(incomingJson)
  return incomingIndex >= existingIndex ? incomingJson : existingJson
}

export function assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson: string): void {
  const byteLength = new TextEncoder().encode(sdkPersistenceJson).byteLength
  if (byteLength > ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES) {
    throw new Error(
      `Arkade SDK persistence exceeds ${ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES} bytes`,
    )
  }
}

export async function loadSdkPersistenceJsonForConnection(params: {
  password: string
  walletId: number
  connectionId: string
}): Promise<string | undefined> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  return findArkadeOperatorConnection(payload, params.connectionId)?.sdkPersistenceJson
}

export async function saveLastSuccessfulOperatorSyncAtForConnection(params: {
  password: string
  walletId: number
  connectionId: string
  lastSuccessfulOperatorSyncAt: string
}): Promise<void> {
  const { password, walletId, connectionId, lastSuccessfulOperatorSyncAt } = params
  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  const existing = findArkadeOperatorConnection(payload, connectionId)
  if (existing == null) {
    throw new Error(`Unknown Arkade connection: ${connectionId}`)
  }

  await upsertArkadeOperatorConnection({
    password,
    walletId,
    setActiveForNetwork: false,
    connection: {
      ...existing,
      lastSuccessfulOperatorSyncAt,
    },
  })
}

export async function saveSdkPersistenceJsonForConnection(params: {
  password: string
  walletId: number
  connectionId: string
  sdkPersistenceJson: string
  lastSuccessfulOperatorSyncAt?: string
}): Promise<void> {
  const { password, walletId, connectionId, sdkPersistenceJson } = params
  assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson)

  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  const existing = findArkadeOperatorConnection(payload, connectionId)
  if (existing == null) {
    throw new Error(`Unknown Arkade connection: ${connectionId}`)
  }

  await upsertArkadeOperatorConnection({
    password,
    walletId,
    setActiveForNetwork: false,
    connection: {
      ...existing,
      sdkPersistenceJson: mergeSdkPersistenceJsonMonotonic(
        existing.sdkPersistenceJson,
        sdkPersistenceJson,
      ),
      lastSuccessfulOperatorSyncAt:
        params.lastSuccessfulOperatorSyncAt ?? existing.lastSuccessfulOperatorSyncAt,
    },
  })
}
