import { loadLightningConnectionsForWallet } from '@/lib/lightning/lightning-wallet-secrets'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { useLightningStore } from '@/stores/lightningStore'
import { getMatchingLightningConnectionsForDashboard } from '@/lib/lightning/lightning-connection-utils'
import {
  configureLightningSyncForLoadedRail,
  orchestrateLightningPostLoadSync,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import type {
  LightningLoadLifecycleSnapshot,
  LightningLoadParams,
} from '@/lib/wallet/lifecycle/lightning-load-lifecycle-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { lightningRailScopeKey } from '@/lib/wallet/lifecycle/lightning-rail-types'
import {
  LIFECYCLE_LOAD_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type { LightningLoadLifecycleSnapshot, LightningLoadParams } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-types'

let snapshot: LightningLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
  errorMessage: null,
}

const listeners = new Set<(next: LightningLoadLifecycleSnapshot) => void>()
const inFlightLoadTracker = createInFlightLifecycleTracker()
let lastLoadParams: LightningLoadParams | null = null

function loadKey(params: LightningLoadParams): string {
  return lightningRailScopeKey(params)
}

function notifyListeners(): void {
  const current = getLightningLoadLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: LightningLoadLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function isLightningLoadConfigured(params: LightningLoadParams): boolean {
  const { isLightningEnabled } = useFeatureStore.getState()
  return isLightningEnabled && isLightningSupported(params.networkMode)
}

export function getLightningLoadLifecycleSnapshot(): LightningLoadLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeLightningLoadLifecycle(
  listener: (next: LightningLoadLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitLightningLoadQuiescence(): Promise<void> {
  await inFlightLoadTracker.awaitQuiescence()
}

/** True when this network's Lightning rail failed to load and should be ignored until network change or retry. */
export function isLightningLoadFailedForNetwork(networkMode: LightningLoadParams['networkMode']): boolean {
  const current = getLightningLoadLifecycleSnapshot()
  return current.loadPhase === 'load-error' && current.networkMode === networkMode
}

export function syncLightningLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightLoadTracker.getCurrent() != null,
    )
  ) {
    return
  }
  setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
}

export async function orchestrateLightningLoad(params: LightningLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isLightningLoadConfigured(params)) {
    setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
    return
  }

  if (isLightningLoadFailedForNetwork(networkMode) && !params.allowRetryFromError) {
    return
  }

  const { allowRetryFromError: _allowRetryFromError, ...persistedParams } = params
  lastLoadParams = persistedParams

  const key = loadKey(params)
  const coalesced = getCoalescedInFlightPromise(inFlightLoadTracker, key)
  if (coalesced != null) {
    return coalesced
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightLoadTracker, key)
  if (afterDifferentWork != null) {
    return afterDifferentWork
  }

  return inFlightLoadTracker.begin(key, async () => {
    setSnapshot({ loadPhase: 'loading', networkMode, errorMessage: null })
    try {
      const connections = await loadLightningConnectionsForWallet({ walletId })
      useLightningStore.getState().replaceConnectionsForWallet(walletId, connections)

      if (connections.length === 0) {
        setSnapshot({ loadPhase: 'not-configured', networkMode: null, errorMessage: null })
        return
      }

      setSnapshot({ loadPhase: 'loaded', networkMode, errorMessage: null })

      const railScope = { walletId, networkMode }
      configureLightningSyncForLoadedRail(railScope)

      if (getMatchingLightningConnectionsForDashboard().length > 0) {
        void orchestrateLightningPostLoadSync({
          walletId,
          networkMode,
        })
      }
    } catch (error) {
      setSnapshot({
        loadPhase: 'load-error',
        networkMode,
        errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_LOAD_ERROR_FALLBACK),
      })
      throw error
    }
  })
}

export async function orchestrateLightningRetryLoad(): Promise<void> {
  if (lastLoadParams == null) {
    throw new Error('No Lightning load to retry')
  }
  return orchestrateLightningLoad({ ...lastLoadParams, allowRetryFromError: true })
}

/**
 * Re-runs Lightning load after connections were added or removed in memory and persisted.
 * Unlock may have left the rail `not-configured` when no connections existed yet.
 */
export async function reloadLightningRailAfterConnectionsChanged(
  walletId: number,
): Promise<void> {
  const networkMode = useWalletStore.getState().networkMode
  await orchestrateLightningLoad({ walletId, networkMode })
}

/** @internal Test-only reset */
export function resetLightningLoadLifecycleStateForTests(): void {
  snapshot = { loadPhase: 'not-configured', networkMode: null, errorMessage: null }
  inFlightLoadTracker.clearCurrent()
  lastLoadParams = null
  listeners.clear()
}
