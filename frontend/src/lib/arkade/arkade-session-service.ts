import { awaitInFlightWalletSecretsWrites, getDatabase, getWalletSecretsEncrypted } from '@/db'
import {
  clearArkadeDashboardStore,
  refreshArkadeStoreFromLoadedWasm,
} from '@/lib/arkade/arkade-persistence-store-sync'
import {
  awaitBackgroundArkadeOperatorSync,
  runArkadeOperatorSyncAndPersist,
} from '@/lib/arkade/arkade-operator-sync'
import {
  ensureArkadeOperatorConnection,
  findActiveArkadeConnectionSummary,
  resolveArkadeEndpointsForConnection,
} from '@/lib/arkade/arkade-operator-connections'
import {
  ensureArkadeWorkerSecretsChannel,
  ensureSecretsChannel,
} from '@/workers/secrets-channel'
import { ensureArkadeEncryptedSecretsHost } from '@/workers/arkade-persistence-channel'
import {
  getArkadeWorker,
  getArkadeWorkerIfExists,
  terminateArkadeWorker,
} from '@/workers/arkade-factory'
import {
  getArkadeEndpoints,
  isArkadeDelegatorConfigured,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { arkadeSessionKey } from '@/lib/arkade/arkade-session-key'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import { removeArkadeDashboardSyncQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

let openSessionInFlight: Promise<void> | null = null
let lastOpenedSessionKey: string | null = null

/** Best-effort maintenance after WASM session open; must not block session registration. */
async function runPostOpenArkadeMaintenance(
  worker: Awaited<ReturnType<typeof getArkadeWorker>>,
  networkMode: ArkadeSupportedNetworkMode,
): Promise<void> {
  try {
    await worker.finalizePendingTransactions()
  } catch (err) {
    console.warn('Arkade finalizePendingTransactions failed after session open', err)
  }

  if (!isArkadeDelegatorConfigured(networkMode)) {
    return
  }

  try {
    const delegateResult = await worker.delegateSpendableVtxos()
    if (delegateResult.failed > 0 && delegateResult.errorMessage != null) {
      console.warn(
        'Arkade delegateSpendableVtxos failed after session open',
        delegateResult.errorMessage,
      )
    }
  } catch (err) {
    console.warn('Arkade delegateSpendableVtxos failed after session open', err)
  }
}

export async function closeArkadeSession(): Promise<void> {
  if (openSessionInFlight != null) {
    try {
      await openSessionInFlight
    } catch {
      // Session open failed or was superseded — still tear down.
    }
  }

  openSessionInFlight = null
  lastOpenedSessionKey = null
  await awaitBackgroundArkadeOperatorSync()
  const arkadeWorker = getArkadeWorkerIfExists()
  if (arkadeWorker != null) {
    await arkadeWorker.flushSdkPersistence()
    await awaitInFlightWalletSecretsWrites()
    try {
      await arkadeWorker.closeSession()
    } catch {
      // closeSession is best-effort during teardown.
    }
  }
  terminateArkadeWorker()
  clearArkadeDashboardStore()
  removeArkadeDashboardQueries()
  removeArkadeDashboardSyncQueries()
}

export async function openArkadeSessionForWallet(params: {
  walletId: number
  networkMode: NetworkMode
}): Promise<void> {
  const { walletId, networkMode } = params
  if (!isArkadeActiveForNetworkMode(networkMode)) {
    await closeArkadeSession()
    return
  }
  if (!isArkadeSupportedNetworkMode(networkMode)) {
    return
  }

  if (openSessionInFlight != null) {
    await openSessionInFlight
    return
  }

  const openWork = runArkadeSessionOpenWork({
    walletId,
    networkMode,
  })
  openSessionInFlight = openWork

  try {
    await openWork
  } finally {
    if (openSessionInFlight === openWork) {
      openSessionInFlight = null
    }
  }
}

function runArkadeSessionOpenWork(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
}): Promise<void> {
  const { walletId, networkMode } = params

  return (async () => {
    await ensureSecretsChannel()
    await ensureArkadeEncryptedSecretsHost()
    const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)

    let connection = await findActiveArkadeConnectionSummary({
      walletId,
      networkMode,
      encryptedPayload: encrypted.payload,
    })
    const hadPersistedConnection = connection != null
    const provisionalKey = connection
      ? arkadeSessionKey(walletId, networkMode, connection.id)
      : null

    if (provisionalKey != null && lastOpenedSessionKey === provisionalKey) {
      const worker = getArkadeWorkerIfExists()
      if (worker != null && connection != null) {
        try {
          const sessionOpen = await worker.hasOpenSession({
            walletId,
            networkMode,
            connectionId: connection.id,
          })
          if (sessionOpen) {
            return
          }
        } catch {
          // Worker unhealthy — fall through and reopen.
        }
      }
      lastOpenedSessionKey = null
    }

    const defaultEndpoints = getArkadeEndpoints(networkMode)
    const endpoints = connection
      ? resolveArkadeEndpointsForConnection(connection)
      : defaultEndpoints
    const connectionId = connection?.id ?? crypto.randomUUID()

    const worker = getArkadeWorker()
    await ensureArkadeWorkerSecretsChannel()
    const openResult = await worker.openSession({
      encryptedMnemonic: encrypted.mnemonic,
      encryptedPayload: encrypted.payload,
      walletId,
      networkMode,
      connectionId,
      arkServerUrl: endpoints.arkServerUrl,
      delegatorUrl: endpoints.delegatorUrl,
      esploraUrl: endpoints.esploraUrl,
    })

    connection = await ensureArkadeOperatorConnection({
      walletId,
      networkMode,
      connectionId,
      operatorSignerPkHex: openResult.operatorSignerPkHex,
      operatorUrl: endpoints.arkServerUrl,
      delegatorUrl: endpoints.delegatorUrl,
      persistInitialSdkFromWasm: !hadPersistedConnection,
    })

    await worker.reconcileActiveConnectionId(connection.id)

    useWalletStore.getState().setLastOperatorSyncTime(null)

    const operatorSyncParams = {
      walletId,
      networkMode,
      connectionId: connection.id,
    }
    const syncParams = { ...operatorSyncParams, sessionAlreadyOpen: true as const }
    if (connection.lastSuccessfulOperatorSyncAt == null) {
      await runArkadeOperatorSyncAndPersist(syncParams)
      await refreshArkadeStoreFromLoadedWasm(connection.id)
    } else {
      // Hydrate from local persistence first so receive address is stable, then sync.
      await refreshArkadeStoreFromLoadedWasm(connection.id)
      await runArkadeOperatorSyncAndPersist(syncParams)
      await refreshArkadeStoreFromLoadedWasm(connection.id)
    }
    // Expose connection id only after receive address is hydrated from WASM persistence.
    useWalletStore.getState().setActiveArkadeConnectionId(connection.id)
    lastOpenedSessionKey = arkadeSessionKey(walletId, networkMode, connection.id)

    void runPostOpenArkadeMaintenance(worker, networkMode)
  })()
}

/** Wait for unlock/network-switch session open; queries must not call open themselves. */
export async function awaitArkadeSessionReady(): Promise<void> {
  if (openSessionInFlight != null) {
    await openSessionInFlight.catch(() => undefined)
  }
}

export async function refreshArkadeSessionAfterNetworkSwitch(params: {
  walletId: number | null
  networkMode: NetworkMode
}): Promise<void> {
  await closeArkadeSession()
  if (params.walletId == null) return
  await openArkadeSessionForWallet({
    walletId: params.walletId,
    networkMode: params.networkMode,
  })
}
