import { awaitInFlightWalletSecretsWrites } from '@/db'
import { clearArkadeDashboardStore } from '@/lib/arkade/arkade-persistence-store-sync'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import { removeArkadeDashboardSyncQueries } from '@/lib/arkade/arkade-dashboard-sync'
import {
  awaitArkadeLoadQuiescence,
  forceResetArkadeLoadLifecycleForTeardown,
  getArkadeLoadLifecycleSnapshot,
  orchestrateArkadeLoad,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  awaitArkadeSaveQuiescence,
  forceResetArkadeSaveLifecycleForTeardown,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  awaitArkadeSyncQuiescence,
  forceResetArkadeSyncLifecycleForTeardown,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { getArkadeWorkerIfExists, terminateArkadeWorker } from '@/workers/arkade-factory'
import type { NetworkMode } from '@/stores/walletStore'

export async function closeArkadeSession(): Promise<void> {
  await awaitArkadeLoadQuiescence()
  await awaitArkadeSyncQuiescence()
  await awaitArkadeSaveQuiescence()

  const arkadeWorker = getArkadeWorkerIfExists()
  const sessionWasSuccessfullyLoaded =
    getArkadeLoadLifecycleSnapshot().loadPhase === 'loaded'

  if (sessionWasSuccessfullyLoaded && arkadeWorker != null) {
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
  forceResetArkadeLoadLifecycleForTeardown()
  forceResetArkadeSyncLifecycleForTeardown()
  forceResetArkadeSaveLifecycleForTeardown()
}

export async function openArkadeSessionForWallet(params: {
  walletId: number
  networkMode: NetworkMode
}): Promise<void> {
  await orchestrateArkadeLoad(params)
}

/** @deprecated Use awaitArkadeLoadQuiescence or check load lifecycle snapshot. */
export async function awaitArkadeSessionReady(): Promise<void> {
  await awaitArkadeLoadQuiescence()
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

export { awaitArkadeLoadQuiescence } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
