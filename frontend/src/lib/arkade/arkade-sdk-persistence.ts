import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import {
  findActiveArkadeOperatorConnection,
  findArkadeOperatorConnection,
} from '@/lib/arkade/arkade-operator-connections'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { findStoredArkadeWallet } from '@/lib/arkade/arkade-wallet-secrets'
import { ARKADE_SDK_PERSISTENCE_JSON_MAX_BYTES } from '@/lib/arkade/arkade-sdk-persistence-types'
import type { WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

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

/** Active connection for network, else legacy arkadeWallets row during migration. */
export async function loadSdkPersistenceJsonForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<string | undefined> {
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    params.password,
    params.walletId,
  )
  const active = findActiveArkadeOperatorConnection(payload, params.networkMode)
  if (active?.sdkPersistenceJson != null) {
    return active.sdkPersistenceJson
  }
  return findStoredArkadeWallet(payload, params.networkMode)?.sdkPersistenceJson
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

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const existing = findArkadeOperatorConnection(payload, connectionId)
      if (existing == null) {
        throw new Error(`Unknown Arkade connection: ${connectionId}`)
      }
      const merged = {
        ...existing,
        sdkPersistenceJson,
        lastSuccessfulOperatorSyncAt:
          params.lastSuccessfulOperatorSyncAt ?? existing.lastSuccessfulOperatorSyncAt,
      }
      const others = payload.arkadeOperatorConnections.filter(
        (row) => row.id !== connectionId,
      )
      return {
        ...payload,
        arkadeOperatorConnections: [...others, merged],
        arkadeWallets: [],
      }
    },
  })
}

/** @deprecated Use saveSdkPersistenceJsonForConnection */
export async function saveSdkPersistenceJsonForNetwork(params: {
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  sdkPersistenceJson: string
}): Promise<void> {
  const { password, walletId, networkMode, sdkPersistenceJson } = params
  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  const active = findActiveArkadeOperatorConnection(payload, networkMode)
  if (active != null) {
    await saveSdkPersistenceJsonForConnection({
      password,
      walletId,
      connectionId: active.id,
      sdkPersistenceJson,
    })
    return
  }

  assertSdkPersistenceJsonWithinSizeLimit(sdkPersistenceJson)
  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (legacyPayload): Promise<WalletSecretsPayload> => {
      const existing = findStoredArkadeWallet(legacyPayload, networkMode)
      const now = new Date().toISOString()
      const merged = {
        networkMode,
        createdAt: existing?.createdAt ?? now,
        arkadeAddress: existing?.arkadeAddress,
        lastSessionOpenedAt: existing?.lastSessionOpenedAt,
        sdkPersistenceJson,
      }
      const others = (legacyPayload.arkadeWallets ?? []).filter(
        (row) => row.networkMode !== networkMode,
      )
      return {
        ...legacyPayload,
        arkadeWallets: [...others, merged],
      }
    },
  })
}
