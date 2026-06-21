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
import { lightningRailScopeKey } from '@/lib/wallet/lifecycle/lightning-rail-types'

export type { LightningLoadLifecycleSnapshot, LightningLoadParams } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-types'

type InFlightLoad = {
  key: string
  promise: Promise<void>
}

let snapshot: LightningLoadLifecycleSnapshot = {
  loadPhase: 'not-configured',
  networkMode: null,
}

const listeners = new Set<(next: LightningLoadLifecycleSnapshot) => void>()
let inFlightLoad: InFlightLoad | null = null

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

function clearInFlightLoad(work: InFlightLoad): void {
  if (inFlightLoad === work) {
    inFlightLoad = null
  }
}

function beginInFlightLoad(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightLoad = { key, promise }
  inFlightLoad = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightLoad(work)
    }
  })()
  return promise
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
  if (inFlightLoad != null) {
    await inFlightLoad.promise.catch(() => undefined)
  }
}

export function syncLightningLoadLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightLoad != null) {
    return
  }
  setSnapshot({ loadPhase: 'not-configured', networkMode: null })
}

export async function orchestrateLightningLoad(params: LightningLoadParams): Promise<void> {
  const { walletId, networkMode } = params

  if (!isLightningLoadConfigured(params)) {
    setSnapshot({ loadPhase: 'not-configured', networkMode: null })
    return
  }

  const key = loadKey(params)
  if (inFlightLoad?.key === key) {
    return inFlightLoad.promise
  }

  if (inFlightLoad != null) {
    await inFlightLoad.promise.catch(() => undefined)
    if (inFlightLoad?.key === key) {
      return inFlightLoad.promise
    }
  }

  return beginInFlightLoad(key, async () => {
    setSnapshot({ loadPhase: 'loading', networkMode })
    try {
      const connections = await loadLightningConnectionsForWallet({ walletId })
      useLightningStore.getState().replaceConnectionsForWallet(walletId, connections)

      if (connections.length === 0) {
        setSnapshot({ loadPhase: 'not-configured', networkMode: null })
        return
      }

      setSnapshot({ loadPhase: 'loaded', networkMode })

      const railScope = { walletId, networkMode }
      configureLightningSyncForLoadedRail(railScope)

      if (getMatchingLightningConnectionsForDashboard().length > 0) {
        void orchestrateLightningPostLoadSync({
          walletId,
          networkMode,
        })
      }
    } catch (error) {
      setSnapshot({ loadPhase: 'load-error', networkMode })
      throw error
    }
  })
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
  snapshot = { loadPhase: 'not-configured', networkMode: null }
  inFlightLoad = null
  listeners.clear()
}
