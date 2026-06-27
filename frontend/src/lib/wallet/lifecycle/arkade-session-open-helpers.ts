import type { SplitWalletSecretsEncryptedBlobs } from '@/db'
import type { ArkadeOperatorConnectionSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  ensureArkadeOperatorConnection,
  resolveArkadeEndpointsForConnection,
} from '@/lib/arkade/arkade-operator-connections'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import {
  getArkadeEndpoints,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import { ensureArkadeWorkerSecretsChannel } from '@/workers/secrets-channel'
import { getArkadeWorker, getArkadeWorkerIfExists } from '@/workers/arkade-factory'
import type { OpenArkadeSessionResult } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

type ArkadeWorker = Awaited<ReturnType<typeof getArkadeWorker>>

export type ArkadeSessionReuseState = {
  lastOpenedSessionKey: string | null
  setLastOpenedSessionKey: (key: string | null) => void
}

/**
 * When the worker already has this wallet/network/connection session open, refresh
 * dashboard state and skip a full reopen.
 */
export async function tryReuseExistingArkadeSession(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connection: ArkadeOperatorConnectionSummary
  sessionReuseState: ArkadeSessionReuseState
}): Promise<string | null> {
  const sessionKey = arkadeSessionKey(
    params.walletId,
    params.networkMode,
    params.connection.id,
  )
  if (params.sessionReuseState.lastOpenedSessionKey !== sessionKey) {
    return null
  }

  const worker = getArkadeWorkerIfExists()
  if (worker == null) {
    params.sessionReuseState.setLastOpenedSessionKey(null)
    return null
  }

  try {
    const sessionOpen = await worker.hasOpenSession({
      walletId: params.walletId,
      networkMode: params.networkMode,
      connectionId: params.connection.id,
    })
    if (!sessionOpen) {
      params.sessionReuseState.setLastOpenedSessionKey(null)
      return null
    }

    await refreshArkadeStoreFromLoadedWasm(params.connection.id)
    useWalletStore.getState().setActiveArkadeConnectionId(params.connection.id)
    useWalletStore.getState().setLastOperatorSyncTime(null)
    return params.connection.id
  } catch {
    params.sessionReuseState.setLastOpenedSessionKey(null)
    return null
  }
}

export async function openFreshArkadeWorkerSession(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  encrypted: SplitWalletSecretsEncryptedBlobs
  connection: ArkadeOperatorConnectionSummary | undefined
  hadPersistedConnection: boolean
}): Promise<{
  worker: ArkadeWorker
  connection: ArkadeOperatorConnectionSummary
  openResult: OpenArkadeSessionResult
}> {
  const defaultEndpoints = getArkadeEndpoints(params.networkMode)
  const endpoints = params.connection
    ? resolveArkadeEndpointsForConnection(params.connection)
    : defaultEndpoints
  const connectionId = params.connection?.id ?? crypto.randomUUID()

  const worker = getArkadeWorker()
  await ensureArkadeWorkerSecretsChannel()
  const openResult = await worker.openSession({
    encryptedMnemonic: params.encrypted.mnemonic,
    encryptedPayload: params.encrypted.payload,
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId,
    arkServerUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    esploraUrl: endpoints.esploraUrl,
  })

  const connection = await ensureArkadeOperatorConnection({
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId,
    operatorSignerPkHex: openResult.operatorSignerPkHex,
    operatorUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    persistInitialSdkFromWasm: !params.hadPersistedConnection,
    signerMigrationHint: openResult.signerMigrationHint,
  })

  return { worker, connection, openResult }
}

export async function hydrateArkadeDashboardAfterSessionOpen(params: {
  worker: ArkadeWorker
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
  signerMigrationHint: OpenArkadeSessionResult['signerMigrationHint']
  sessionReuseState: ArkadeSessionReuseState
  runPostOpenMaintenance: (
    worker: ArkadeWorker,
    networkMode: ArkadeSupportedNetworkMode,
  ) => Promise<void>
}): Promise<void> {
  if (params.signerMigrationHint != null) {
    useWalletStore.getState().setArkadeSignerMigrationHint(params.signerMigrationHint)
  } else {
    useWalletStore.getState().setArkadeSignerMigrationHint(null)
  }

  await params.worker.reconcileActiveConnectionId(params.connectionId)
  useWalletStore.getState().setLastOperatorSyncTime(null)
  await refreshArkadeStoreFromLoadedWasm(params.connectionId)
  useWalletStore.getState().setActiveArkadeConnectionId(params.connectionId)
  params.sessionReuseState.setLastOpenedSessionKey(
    arkadeSessionKey(params.walletId, params.networkMode, params.connectionId),
  )

  void params.runPostOpenMaintenance(params.worker, params.networkMode)
}
