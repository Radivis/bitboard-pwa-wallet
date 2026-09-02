import type { SplitWalletSecretsEncryptedBlobs } from '@/db'
import type { ArkadeAccountSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  ensureArkadeAccount,
  resolveArkadeEndpointsForAccount,
} from '@/lib/arkade/arkade-accounts'
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
 * When the worker already has this wallet/network/account session open, refresh
 * dashboard state and skip a full reopen.
 */
export async function tryReuseExistingArkadeSession(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  account: ArkadeAccountSummary
  sessionReuseState: ArkadeSessionReuseState
}): Promise<string | null> {
  const sessionKey = arkadeSessionKey(
    params.walletId,
    params.networkMode,
    params.account.id,
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
      arkadeAccountId: params.account.id,
    })
    if (!sessionOpen) {
      params.sessionReuseState.setLastOpenedSessionKey(null)
      return null
    }

    await refreshArkadeStoreFromLoadedWasm(params.account.id)
    useWalletStore.getState().setActiveArkadeAccountId(params.account.id)
    useWalletStore.getState().setLastOperatorSyncTime(null)
    return params.account.id
  } catch {
    params.sessionReuseState.setLastOpenedSessionKey(null)
    return null
  }
}

export async function openFreshArkadeWorkerSession(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  encrypted: SplitWalletSecretsEncryptedBlobs
  account: ArkadeAccountSummary | undefined
  hadPersistedAccount: boolean
}): Promise<{
  worker: ArkadeWorker
  account: ArkadeAccountSummary
  openResult: OpenArkadeSessionResult
}> {
  const defaultEndpoints = getArkadeEndpoints(params.networkMode)
  const endpoints = params.account
    ? resolveArkadeEndpointsForAccount(params.account)
    : defaultEndpoints
  const arkadeAccountId = params.account?.id ?? crypto.randomUUID()

  const worker = getArkadeWorker()
  await ensureArkadeWorkerSecretsChannel()
  const openResult = await worker.openSession({
    encryptedMnemonic: params.encrypted.mnemonic,
    encryptedPayload: params.encrypted.payload,
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId,
    arkServerUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    esploraUrl: endpoints.esploraUrl,
  })

  const account = await ensureArkadeAccount({
    walletId: params.walletId,
    networkMode: params.networkMode,
    arkadeAccountId,
    operatorSignerPkHex: openResult.operatorSignerPkHex,
    operatorUrl: endpoints.arkServerUrl,
    delegatorUrl: endpoints.delegatorUrl,
    persistInitialSdkFromWasm: !params.hadPersistedAccount,
    signerMigrationHint: openResult.signerMigrationHint,
  })

  return { worker, account, openResult }
}

export async function hydrateArkadeDashboardAfterSessionOpen(params: {
  worker: ArkadeWorker
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  arkadeAccountId: string
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

  await params.worker.reconcileActiveAccountId(params.arkadeAccountId)
  useWalletStore.getState().setLastOperatorSyncTime(null)
  await refreshArkadeStoreFromLoadedWasm(params.arkadeAccountId)
  useWalletStore.getState().setActiveArkadeAccountId(params.arkadeAccountId)
  params.sessionReuseState.setLastOpenedSessionKey(
    arkadeSessionKey(params.walletId, params.networkMode, params.arkadeAccountId),
  )

  void params.runPostOpenMaintenance(params.worker, params.networkMode)
}
