import { awaitInFlightWalletSecretsWrites } from '@/db'
import { reportArkadeSessionOpenError } from '@/lib/arkade/arkade-session-open-error-toast'
import { tearDownArkadeWorkerAndClientState } from '@/lib/arkade/arkade-session-teardown'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  awaitArkadeLoadQuiescence,
  getArkadeLoadLifecycleSnapshot,
  orchestrateArkadeLoad,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  awaitArkadeSaveQuiescence,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  awaitArkadeSyncQuiescence,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { getArkadeWorkerIfExists } from '@/workers/arkade-factory'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Force-teardown Arkade during network switch. Does not wait for in-flight load/sync/save
 * (a stuck Esplora scan must not block leaving Mainnet or other networks).
 */
export async function abortArkadeSessionForNetworkSwitch(): Promise<void> {
  const arkadeWorker = getArkadeWorkerIfExists()
  const loadPhase = getArkadeLoadLifecycleSnapshot().loadPhase

  if (loadPhase === 'loaded' && arkadeWorker != null) {
    try {
      await arkadeWorker.flushSdkPersistence()
      await awaitInFlightWalletSecretsWrites()
    } catch {
      // Best-effort flush before worker termination.
    }
  }

  tearDownArkadeWorkerAndClientState()
}

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
  tearDownArkadeWorkerAndClientState()
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
  if (params.walletId == null) return
  if (
    !isArkadeActiveForNetworkMode(params.networkMode) ||
    !isArkadeSupportedNetworkMode(params.networkMode)
  ) {
    return
  }
  try {
    await openArkadeSessionForWallet({
      walletId: params.walletId,
      networkMode: params.networkMode,
    })
  } catch (error) {
    reportArkadeSessionOpenError(error)
  }
}

export { awaitArkadeLoadQuiescence } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
