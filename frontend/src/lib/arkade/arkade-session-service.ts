import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { ensureSecretsChannel } from '@/workers/secrets-channel'
import {
  getArkadeWorker,
  terminateArkadeWorker,
} from '@/workers/arkade-factory'
import { buildArkadeSnapshotFromWorkerData } from '@/workers/arkade-api'
import {
  getArkadeEndpoints,
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { applyArkadeSnapshotPatch } from '@/lib/arkade/arkade-snapshot-persistence'
import { upsertArkadeWalletState } from '@/lib/arkade/arkade-wallet-secrets'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import type { NetworkMode } from '@/stores/walletStore'

let openSessionInFlight: Promise<void> | null = null
let lastOpenedSessionKey: string | null = null

function sessionKey(walletId: number, networkMode: ArkadeSupportedNetworkMode): string {
  return `${walletId}:${networkMode}`
}

export async function closeArkadeSession(): Promise<void> {
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
    const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
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
    })

    await worker.finalizePendingTransactions()
    await worker.delegateSpendableVtxos()

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

    try {
      const balance = await worker.getBalance()
      const payments = await worker.getTransactionHistory()
      const snapshot = buildArkadeSnapshotFromWorkerData({ balance, payments })
      await applyArkadeSnapshotPatch({
        password,
        walletId,
        networkMode,
        snapshot,
      })
    } catch {
      // Snapshot is best-effort on open.
    }

    lastOpenedSessionKey = key
  })()

  try {
    await openSessionInFlight
  } finally {
    openSessionInFlight = null
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
