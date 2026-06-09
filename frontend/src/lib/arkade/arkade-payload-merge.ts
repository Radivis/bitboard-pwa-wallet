import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type {
  StoredArkadeOperatorConnection,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

/** Connection metadata safe to expose on the main thread (no SDK blob). */
export type ArkadeOperatorConnectionSummary = Omit<
  StoredArkadeOperatorConnection,
  'sdkPersistenceJson'
>

export function toArkadeOperatorConnectionSummary(
  connection: StoredArkadeOperatorConnection,
): ArkadeOperatorConnectionSummary {
  const { sdkPersistenceJson: _omittedSdkPersistenceJson, ...summary } = connection
  void _omittedSdkPersistenceJson
  return summary
}

export function findArkadeOperatorConnection(
  payload: WalletSecretsPayload,
  connectionId: string,
): StoredArkadeOperatorConnection | undefined {
  return payload.arkadeOperatorConnections.find((row) => row.id === connectionId)
}

export function findActiveArkadeOperatorConnection(
  payload: WalletSecretsPayload,
  networkMode: ArkadeSupportedNetworkMode,
): StoredArkadeOperatorConnection | undefined {
  const activeId = payload.activeArkadeConnectionIdByNetwork[networkMode]
  if (activeId == null) return undefined
  return findArkadeOperatorConnection(payload, activeId)
}

export function assertOperatorSignerMatches(
  connection: StoredArkadeOperatorConnection,
  operatorSignerPkHex: string,
): void {
  if (connection.operatorSignerPkHex !== operatorSignerPkHex) {
    throw new Error(
      'Arkade persistence belongs to a different operator (signer public key mismatch)',
    )
  }
}

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

export function upsertArkadeOperatorConnectionInPayload(
  payload: WalletSecretsPayload,
  connection: StoredArkadeOperatorConnection,
  setActiveForNetwork = true,
): WalletSecretsPayload {
  const others = payload.arkadeOperatorConnections.filter((row) => row.id !== connection.id)
  const activeArkadeConnectionIdByNetwork = {
    ...payload.activeArkadeConnectionIdByNetwork,
  }
  if (setActiveForNetwork) {
    activeArkadeConnectionIdByNetwork[connection.networkMode] = connection.id
  }
  return {
    ...payload,
    arkadeOperatorConnections: [...others, connection],
    activeArkadeConnectionIdByNetwork,
  }
}

export function defaultArkadeOperatorLabel(operatorUrl: string): string {
  try {
    const url = new URL(operatorUrl)
    const pathSegment = url.pathname.split('/').filter(Boolean).pop()
    if (pathSegment != null && pathSegment.length > 0) {
      return pathSegment
    }
    return url.hostname
  } catch {
    return 'Arkade operator'
  }
}

export function buildDefaultArkadeOperatorConnection(params: {
  networkMode: ArkadeSupportedNetworkMode
  operatorUrl: string
  delegatorUrl: string
  operatorSignerPkHex: string
  sdkPersistenceJson?: string
}): StoredArkadeOperatorConnection {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    label: defaultArkadeOperatorLabel(params.operatorUrl),
    networkMode: params.networkMode,
    operatorUrl: params.operatorUrl,
    delegatorUrl: params.delegatorUrl || undefined,
    operatorSignerPkHex: params.operatorSignerPkHex,
    createdAt: now,
    sdkPersistenceJson: params.sdkPersistenceJson,
  }
}

export function ensureArkadeOperatorConnectionInPayload(
  payload: WalletSecretsPayload,
  params: {
    networkMode: ArkadeSupportedNetworkMode
    operatorSignerPkHex: string
    operatorUrl: string
    delegatorUrl: string
    sdkPersistenceJson?: string
    connectionId?: string
  },
): { payload: WalletSecretsPayload; connection: StoredArkadeOperatorConnection } {
  const existingActive = findActiveArkadeOperatorConnection(payload, params.networkMode)
  if (existingActive != null) {
    assertOperatorSignerMatches(existingActive, params.operatorSignerPkHex)
    const connection: StoredArkadeOperatorConnection = {
      ...existingActive,
      operatorUrl: params.operatorUrl,
      delegatorUrl: params.delegatorUrl || undefined,
      sdkPersistenceJson: existingActive.sdkPersistenceJson ?? params.sdkPersistenceJson,
      lastSessionOpenedAt: new Date().toISOString(),
    }
    return {
      payload: upsertArkadeOperatorConnectionInPayload(payload, connection),
      connection,
    }
  }

  const matchingConnection = payload.arkadeOperatorConnections.find(
    (row) =>
      row.networkMode === params.networkMode &&
      row.operatorSignerPkHex === params.operatorSignerPkHex,
  )
  if (matchingConnection != null) {
    const connection: StoredArkadeOperatorConnection = {
      ...matchingConnection,
      sdkPersistenceJson: matchingConnection.sdkPersistenceJson ?? params.sdkPersistenceJson,
      lastSessionOpenedAt: new Date().toISOString(),
    }
    return {
      payload: upsertArkadeOperatorConnectionInPayload(payload, connection),
      connection,
    }
  }

  const connection = buildDefaultArkadeOperatorConnection({
    networkMode: params.networkMode,
    operatorUrl: params.operatorUrl,
    delegatorUrl: params.delegatorUrl,
    operatorSignerPkHex: params.operatorSignerPkHex,
    sdkPersistenceJson: params.sdkPersistenceJson,
  })
  if (params.connectionId != null) {
    connection.id = params.connectionId
  }

  return {
    payload: upsertArkadeOperatorConnectionInPayload(payload, connection),
    connection,
  }
}

export function mergeSdkPersistenceIntoPayload(
  payload: WalletSecretsPayload,
  connectionId: string,
  sdkPersistenceJson: string,
  lastSuccessfulOperatorSyncAt?: string,
): WalletSecretsPayload {
  assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson)
  const existing = findArkadeOperatorConnection(payload, connectionId)
  if (existing == null) {
    throw new Error(`Unknown Arkade connection: ${connectionId}`)
  }

  const connection: StoredArkadeOperatorConnection = {
    ...existing,
    sdkPersistenceJson: mergeSdkPersistenceJsonMonotonic(
      existing.sdkPersistenceJson,
      sdkPersistenceJson,
    ),
    lastSuccessfulOperatorSyncAt:
      lastSuccessfulOperatorSyncAt ?? existing.lastSuccessfulOperatorSyncAt,
  }

  return upsertArkadeOperatorConnectionInPayload(payload, connection, false)
}

export function updateOperatorSyncAtInPayload(
  payload: WalletSecretsPayload,
  connectionId: string,
  lastSuccessfulOperatorSyncAt: string,
): WalletSecretsPayload {
  const existing = findArkadeOperatorConnection(payload, connectionId)
  if (existing == null) {
    throw new Error(`Unknown Arkade connection: ${connectionId}`)
  }

  const connection: StoredArkadeOperatorConnection = {
    ...existing,
    lastSuccessfulOperatorSyncAt,
  }

  return upsertArkadeOperatorConnectionInPayload(payload, connection, false)
}
