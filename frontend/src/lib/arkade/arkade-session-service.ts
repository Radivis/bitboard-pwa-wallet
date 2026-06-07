import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { loadSdkPersistenceJsonForNetwork } from '@/lib/arkade/arkade-sdk-persistence'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import { ensureArkadePersistenceChannel } from '@/workers/arkade-persistence-channel'
import {
  getArkadeWorker,
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
  try {
    await getArkadeWorker().closeSession()
  } catch {
    // Worker may already be terminated.
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
    return
  }

  if (openSessionInFlight != null) {
    await openSessionInFlight
    if (lastOpenedSessionKey === key) return
  }

  openSessionInFlight = (async () => {
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
    const { arkadeAddress } = await worker.openSession({
      password,
      encryptedMnemonic: encrypted.mnemonic,
      walletId,
      networkMode,
      arkServerUrl: endpoints.arkServerUrl,
      delegatorUrl: endpoints.delegatorUrl,
      esploraUrl: endpoints.esploraUrl,
      sdkPersistenceJson,
    })

    await worker.finalizePendingTransactions()
    if (isArkadeDelegatorConfigured(networkMode)) {
      await worker.delegateSpendableVtxos()
    }

    const now = new Date().toISOString()
    await upsertArkadeWalletState({
      password,
      walletId,
      networkMode,
      patch: {
        networkMode,
        arkadeAddress,
        lastSessionOpenedAt: now,
      },
    })

    lastOpenedSessionKey = key
  })()

  try {
    await openSessionInFlight
  } finally {
    openSessionInFlight = null
  }
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
