import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import {
  getArkadeEndpoints,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { findStoredArkadeWallet } from '@/lib/arkade/arkade-wallet-secrets'
import type {
  StoredArkadeOperatorConnection,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'

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

export async function loadArkadeConnectionsForWallet(params: {
  password: string
  walletId: number
}): Promise<WalletSecretsPayload['arkadeOperatorConnections']> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  return payload.arkadeOperatorConnections
}

export async function loadActiveArkadeConnectionForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<StoredArkadeOperatorConnection | undefined> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  return findActiveArkadeOperatorConnection(payload, params.networkMode)
}

export async function saveArkadeOperatorConnections(params: {
  password: string
  walletId: number
  arkadeOperatorConnections: StoredArkadeOperatorConnection[]
  activeArkadeConnectionIdByNetwork: WalletSecretsPayload['activeArkadeConnectionIdByNetwork']
}): Promise<void> {
  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId: params.walletId,
    password: params.password,
    transform: async (payload): Promise<WalletSecretsPayload> => ({
      ...payload,
      arkadeOperatorConnections: params.arkadeOperatorConnections,
      activeArkadeConnectionIdByNetwork: params.activeArkadeConnectionIdByNetwork,
      arkadeWallets: [],
    }),
  })
}

export async function upsertArkadeOperatorConnection(params: {
  password: string
  walletId: number
  connection: StoredArkadeOperatorConnection
  setActiveForNetwork?: boolean
}): Promise<StoredArkadeOperatorConnection> {
  const { password, walletId, connection, setActiveForNetwork = true } = params
  let saved: StoredArkadeOperatorConnection | undefined

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const others = payload.arkadeOperatorConnections.filter(
        (row) => row.id !== connection.id,
      )
      saved = connection
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
        arkadeWallets: [],
      }
    },
  })

  if (saved == null) {
    throw new Error('Failed to persist Arkade operator connection')
  }
  return saved
}

/**
 * Creates a default connection from legacy `arkadeWallets` row after first online session open.
 */
export function buildConnectionFromLegacyWalletState(params: {
  networkMode: ArkadeSupportedNetworkMode
  operatorUrl: string
  delegatorUrl: string
  operatorSignerPkHex: string
  legacyCreatedAt?: string
  legacyLastSessionOpenedAt?: string
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
    createdAt: params.legacyCreatedAt ?? now,
    lastSessionOpenedAt: params.legacyLastSessionOpenedAt,
    sdkPersistenceJson: params.sdkPersistenceJson,
  }
}

export async function ensureLegacyArkadeWalletMigrated(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  sdkPersistenceJson?: string
}): Promise<StoredArkadeOperatorConnection> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )

  const existingActive = findActiveArkadeOperatorConnection(payload, params.networkMode)
  if (existingActive != null) {
    assertOperatorSignerMatches(existingActive, params.operatorSignerPkHex)
    return upsertArkadeOperatorConnection({
      password: params.password,
      walletId: params.walletId,
      connection: {
        ...existingActive,
        operatorUrl: params.operatorUrl,
        delegatorUrl: params.delegatorUrl || undefined,
        sdkPersistenceJson:
          existingActive.sdkPersistenceJson ?? params.sdkPersistenceJson,
        lastSessionOpenedAt: new Date().toISOString(),
      },
    })
  }

  const matchingConnection = payload.arkadeOperatorConnections.find(
    (row) =>
      row.networkMode === params.networkMode &&
      row.operatorSignerPkHex === params.operatorSignerPkHex,
  )
  if (matchingConnection != null) {
    return upsertArkadeOperatorConnection({
      password: params.password,
      walletId: params.walletId,
      connection: {
        ...matchingConnection,
        sdkPersistenceJson:
          matchingConnection.sdkPersistenceJson ?? params.sdkPersistenceJson,
        lastSessionOpenedAt: new Date().toISOString(),
      },
    })
  }

  const legacy = findStoredArkadeWallet(payload, params.networkMode)
  const connection = buildConnectionFromLegacyWalletState({
    networkMode: params.networkMode,
    operatorUrl: params.operatorUrl,
    delegatorUrl: params.delegatorUrl,
    operatorSignerPkHex: params.operatorSignerPkHex,
    legacyCreatedAt: legacy?.createdAt,
    legacyLastSessionOpenedAt: legacy?.lastSessionOpenedAt,
    sdkPersistenceJson: params.sdkPersistenceJson ?? legacy?.sdkPersistenceJson,
  })

  return upsertArkadeOperatorConnection({
    password: params.password,
    walletId: params.walletId,
    connection,
  })
}

export function resolveArkadeEndpointsForConnection(
  connection: StoredArkadeOperatorConnection,
): { arkServerUrl: string; delegatorUrl: string; esploraUrl: string } {
  const defaults = getArkadeEndpoints(connection.networkMode)
  return {
    arkServerUrl: connection.operatorUrl,
    delegatorUrl: connection.delegatorUrl ?? defaults.delegatorUrl,
    esploraUrl: defaults.esploraUrl,
  }
}
