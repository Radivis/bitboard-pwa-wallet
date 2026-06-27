import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  awaitArkadeSyncQuiescence,
  orchestrateArkadeSyncThenSave,
  scheduleBackgroundArkadeOperatorSync as scheduleBackgroundArkadeOperatorSyncFromLifecycle,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { reportArkadeOperatorSyncError } from '@/lib/wallet/rail-sync-error-toast'
import type { NetworkMode } from '@/stores/walletStore'

/** Serialize critical persistence with dashboard background operator sync. */
export async function awaitBackgroundArkadeOperatorSync(): Promise<void> {
  await awaitArkadeSyncQuiescence()
}

/**
 * Operator sync for dashboard polling — ensures the WASM session is open first.
 * @deprecated Prefer orchestrateArkadeSyncThenSave with syncKind manual via lifecycle orchestrator.
 */
export async function syncArkadeWithOperator(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}): Promise<void> {
  if (!isArkadeActiveForNetworkMode(params.networkMode)) {
    return
  }

  const { openArkadeSessionForWallet } = await import('@/lib/arkade/arkade-session-service')
  await openArkadeSessionForWallet({
    walletId: params.walletId,
    networkMode: params.networkMode,
  })
  await orchestrateArkadeSyncThenSave({
    ...params,
    syncKind: 'manual',
    awaitCompletion: true,
    throwOnError: true,
    onSyncError: reportArkadeOperatorSyncError,
  })
}

export function scheduleBackgroundArkadeOperatorSync(): void {
  scheduleBackgroundArkadeOperatorSyncFromLifecycle()
}

/**
 * @deprecated Use orchestrateArkadeSyncThenSave from arkade-sync-lifecycle-orchestrator.
 */
export async function runArkadeOperatorSyncAndPersist(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  sessionAlreadyOpen?: boolean
  onError?: (err: unknown) => void
}): Promise<void> {
  const { sessionAlreadyOpen, onError, ...syncParams } = params
  if (!sessionAlreadyOpen) {
    const { openArkadeSessionForWallet } = await import('@/lib/arkade/arkade-session-service')
    await openArkadeSessionForWallet({
      walletId: syncParams.walletId,
      networkMode: syncParams.networkMode,
    })
  }
  await orchestrateArkadeSyncThenSave({
    ...syncParams,
    syncKind: 'manual',
    onSyncError: (err) => {
      onError?.(err)
      reportArkadeOperatorSyncError(err)
    },
    awaitCompletion: true,
    throwOnError: false,
  })
}
