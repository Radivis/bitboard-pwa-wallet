import { awaitInFlightWalletSecretsWrites, getDatabase, getWalletSecretsEncrypted } from '@/db'
import { loadSdkPersistenceJsonForNetwork } from '@/lib/arkade/arkade-sdk-persistence'
import {
  ensureArkadeWorkerSecretsChannel,
  ensureSecretsChannel,
} from '@/workers/secrets-channel'
import { ensureArkadePersistenceChannel } from '@/workers/arkade-persistence-channel'
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
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { upsertArkadeWalletState } from '@/lib/arkade/arkade-wallet-secrets'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import type { NetworkMode } from '@/stores/walletStore'

let openSessionInFlight: Promise<void> | null = null
let lastOpenedSessionKey: string | null = null

function sessionKey(walletId: number, networkMode: ArkadeSupportedNetworkMode): string {
  return `${walletId}:${networkMode}`
}

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
    await worker.delegateSpendableVtxos()
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
  const arkadeWorker = getArkadeWorkerIfExists()
  if (arkadeWorker != null) {
    try {
      await arkadeWorker.flushSdkPersistence()
      await awaitInFlightWalletSecretsWrites()
      await arkadeWorker.closeSession()
    } catch {
      // Worker may already be terminated.
    }
  }
  terminateArkadeWorker()
  removeArkadeDashboardQueries()
}

export async function openArkadeSessionForWallet(params: {
  password: string
  walletId: number
  networkMode: NetworkMode
}): Promise<void> {
  const { password, walletId, networkMode } = params
  if (!isArkadeActiveForNetworkMode(networkMode)) {
    await closeArkadeSession()
    return
  }
  if (!isArkadeSupportedNetworkMode(networkMode)) {
    return
  }

  const key = sessionKey(walletId, networkMode)
  if (lastOpenedSessionKey === key && openSessionInFlight == null) {
    if (getArkadeWorkerIfExists() != null) {
      return
    }
    lastOpenedSessionKey = null
  }

  if (openSessionInFlight != null) {
    await openSessionInFlight
    if (lastOpenedSessionKey === key) return
  }

  const openWork = runArkadeSessionOpenWork({
    password,
    walletId,
    networkMode,
    key,
  })
  // Assign synchronously before awaiting so void unlock paths register in-flight
  // work before post-unlock navigation mounts Arkade queries.
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
  password: string
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  key: string
}): Promise<void> {
  const { password, walletId, networkMode, key } = params

  return (async () => {
    await ensureSecretsChannel()
    await ensureArkadePersistenceChannel()
    const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
    const sdkPersistenceJson = await loadSdkPersistenceJsonForNetwork({
      password,
      walletId,
      networkMode,
    })
    const endpoints = getArkadeEndpoints(networkMode)
    const worker = getArkadeWorker()
    await ensureArkadeWorkerSecretsChannel()
    await worker.openSession({
      password,
      encryptedMnemonic: encrypted.mnemonic,
      walletId,
      networkMode,
      arkServerUrl: endpoints.arkServerUrl,
      delegatorUrl: endpoints.delegatorUrl,
      esploraUrl: endpoints.esploraUrl,
      sdkPersistenceJson,
    })

    lastOpenedSessionKey = key

    const now = new Date().toISOString()
    await upsertArkadeWalletState({
      password,
      walletId,
      networkMode,
      patch: {
        networkMode,
        lastSessionOpenedAt: now,
      },
    })

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
  password: string | null
  walletId: number | null
  networkMode: NetworkMode
}): Promise<void> {
  await closeArkadeSession()
  if (params.password == null || params.walletId == null) return
  await openArkadeSessionForWallet({
    password: params.password,
    walletId: params.walletId,
    networkMode: params.networkMode,
  })
}
