import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { saveLastSuccessfulOperatorSyncAtEncrypted } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { errorMessage } from '@/lib/shared/utils'
import { invalidateArkadeDashboardQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

const BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS = 400

let backgroundOperatorSyncTimer: ReturnType<typeof setTimeout> | null = null
let backgroundOperatorSyncInFlight: Promise<void> | null = null

/** Serialize critical persistence with dashboard background operator sync. */
export async function awaitBackgroundArkadeOperatorSync(): Promise<void> {
  if (backgroundOperatorSyncTimer != null) {
    clearTimeout(backgroundOperatorSyncTimer)
    backgroundOperatorSyncTimer = null
  }
  if (backgroundOperatorSyncInFlight != null) {
    await backgroundOperatorSyncInFlight.catch(() => undefined)
  }
}

async function syncArkadeWithOperatorCore(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}): Promise<void> {
  if (!isArkadeActiveForNetworkMode(params.networkMode)) {
    return
  }

  const worker = getArkadeWorker()
  // syncWithOperator persists the SDK blob via flushSdkPersistenceNow in the worker.
  await worker.syncWithOperator()
  await refreshArkadeStoreFromLoadedWasm()

  const now = new Date().toISOString()
  await saveLastSuccessfulOperatorSyncAtEncrypted({
    walletId: params.walletId,
    connectionId: params.connectionId,
    lastSuccessfulOperatorSyncAt: now,
  })
  useWalletStore.getState().setLastOperatorSyncTime(new Date())
  invalidateArkadeDashboardQueries()
}

/** Operator sync for dashboard polling — ensures the WASM session is open first. */
export async function syncArkadeWithOperator(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}): Promise<void> {
  const { openArkadeSessionForWallet } = await import('@/lib/arkade/arkade-session-service')
  await openArkadeSessionForWallet({
    walletId: params.walletId,
    networkMode: params.networkMode,
  })
  await syncArkadeWithOperatorCore(params)
}

/**
 * Debounced, non-blocking operator sync for dashboard polling.
 * Read paths stay local; this updates the persisted snapshot and store.
 */
export function scheduleBackgroundArkadeOperatorSync(): void {
  if (backgroundOperatorSyncTimer != null) {
    clearTimeout(backgroundOperatorSyncTimer)
  }

  backgroundOperatorSyncTimer = setTimeout(() => {
    backgroundOperatorSyncTimer = null

    const walletState = useWalletStore.getState()
    const networkMode = getCommittedNetworkMode()
    if (
      walletState.activeWalletId == null ||
      walletState.activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }

    if (backgroundOperatorSyncInFlight != null) {
      return
    }

    const syncWork = runArkadeOperatorSyncAndPersist({
      walletId: walletState.activeWalletId,
      networkMode,
      connectionId: walletState.activeArkadeConnectionId,
    })
    backgroundOperatorSyncInFlight = syncWork
    void syncWork.finally(() => {
      if (backgroundOperatorSyncInFlight === syncWork) {
        backgroundOperatorSyncInFlight = null
      }
    })
  }, BACKGROUND_OPERATOR_SYNC_DEBOUNCE_MS)
}

export async function runArkadeOperatorSyncAndPersist(params: {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  /** Set when called from openArkadeSessionForWallet to avoid awaiting the in-flight open. */
  sessionAlreadyOpen?: boolean
  onError?: (err: unknown) => void
}): Promise<void> {
  const { sessionAlreadyOpen, onError, ...syncParams } = params
  try {
    if (sessionAlreadyOpen) {
      await syncArkadeWithOperatorCore(syncParams)
    } else {
      await syncArkadeWithOperator(syncParams)
    }
  } catch (err) {
    onError?.(err)
    toast.error(`Arkade operator sync failed: ${errorMessage(err)}`)
  }
}
