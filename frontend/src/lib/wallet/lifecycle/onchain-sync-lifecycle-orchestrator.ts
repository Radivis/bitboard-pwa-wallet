import { useWalletStore } from '@/stores/walletStore'
import { refreshWalletStoreFromLoadedBdk } from '@/lib/wallet/onchain-bdk-store-sync'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { syncActiveWalletAndUpdateState } from '@/lib/wallet/wallet-utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { getOnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  configureOnchainSaveForLoadedRail,
  orchestrateOnchainSave,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import type {
  OnchainPostUnlockSyncParams,
  OnchainSyncLifecycleSnapshot,
  OnchainSyncParams,
  OnchainSyncThenSaveParams,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'
import type { OnchainSaveParams } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

export type {
  OnchainSyncKind,
  OnchainSyncLifecycleSnapshot,
  OnchainSyncParams,
  OnchainSyncThenSaveParams,
  OnchainPostUnlockSyncParams,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'

type InFlightSync = {
  key: string
  promise: Promise<void>
}

let snapshot: OnchainSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  descriptorScope: null,
}

let suppressCrossTabNotify = false
const listeners = new Set<(next: OnchainSyncLifecycleSnapshot) => void>()
let inFlightSync: InFlightSync | null = null

function syncKey(params: Pick<OnchainSyncParams, 'walletId' | 'networkMode' | 'addressType' | 'accountId' | 'syncKind'>): string {
  return `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}:${params.syncKind}`
}

function descriptorScopeFromParams(
  params: Pick<OnchainSyncParams, 'walletId' | 'networkMode' | 'addressType' | 'accountId'>,
): OnchainRailDescriptorScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
  }
}

function notifyListeners(): void {
  const current = getOnchainSyncLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
  if (!suppressCrossTabNotify) {
    void import('@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync').then(
      ({ notifyOnchainRailLifecycleChangedFromThisTab }) => {
        notifyOnchainRailLifecycleChangedFromThisTab()
      },
    )
  }
}

function setSnapshot(next: OnchainSyncLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function clearInFlightSync(work: InFlightSync): void {
  if (inFlightSync === work) {
    inFlightSync = null
  }
}

function beginInFlightSync(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightSync = { key, promise }
  inFlightSync = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightSync(work)
    }
  })()
  return promise
}

function assertCanStartOnchainSync(params: OnchainSyncParams): void {
  if (params.networkMode === 'lab') {
    throw new Error('On-chain sync is not configured on lab network')
  }
  if (getOnchainLoadLifecycleSnapshot().loadPhase !== 'loaded') {
    throw new Error('On-chain sync requires loaded WASM wallet')
  }
  const walletStatus = useWalletStore.getState().walletStatus
  if (!walletIsUnlockedOrSyncing(walletStatus)) {
    throw new Error('On-chain sync requires unlocked wallet')
  }
}

function toSaveParams(params: OnchainSyncParams): OnchainSaveParams {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
    markFullScanDone: params.markFullScanDone,
    descriptorWalletCoordinates: params.descriptorWalletCoordinates,
  }
}

async function runEsploraSyncBody(params: OnchainSyncParams): Promise<void> {
  await syncActiveWalletAndUpdateState(params.networkMode, {
    useFullScan: params.useFullScan,
  })
}

export function getOnchainSyncLifecycleSnapshot(): OnchainSyncLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeOnchainSyncLifecycle(
  listener: (next: OnchainSyncLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function awaitOnchainSyncQuiescence(): Promise<void> {
  if (inFlightSync != null) {
    await inFlightSync.promise
  }
}

export function configureOnchainSyncForLoadedRail(scope: OnchainRailDescriptorScope): void {
  if (snapshot.syncPhase !== 'not-configured') {
    return
  }
  if (scope.networkMode === 'lab') {
    return
  }
  setSnapshot({
    syncPhase: 'not-syncing',
    descriptorScope: scope,
  })
  configureOnchainSaveForLoadedRail(scope)
}

export function applyOnchainSyncLifecycleSnapshotFromRemote(
  remoteSnapshot: OnchainSyncLifecycleSnapshot,
): void {
  suppressCrossTabNotify = true
  try {
    setSnapshot({ ...remoteSnapshot })
  } finally {
    suppressCrossTabNotify = false
  }
}

export function syncOnchainSyncLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightSync != null) {
    return
  }
  setSnapshot({
    syncPhase: 'not-configured',
    descriptorScope: null,
  })
}

export async function orchestrateOnchainSyncThenSave(
  params: OnchainSyncThenSaveParams,
): Promise<void> {
  const throwOnError = params.throwOnError ?? params.awaitCompletion !== false
  const key = syncKey(params)

  if (inFlightSync?.key === key) {
    return inFlightSync.promise
  }

  if (inFlightSync != null) {
    await inFlightSync.promise
    if (inFlightSync?.key === key) {
      return inFlightSync.promise
    }
  }

  return beginInFlightSync(key, async () => {
    assertCanStartOnchainSync(params)
    const scope = descriptorScopeFromParams(params)
    configureOnchainSyncForLoadedRail(scope)

    setSnapshot({ syncPhase: 'syncing', descriptorScope: scope })

    try {
      await runEsploraSyncBody(params)
      setSnapshot({ syncPhase: 'not-syncing', descriptorScope: scope })
      try {
        await orchestrateOnchainSave(toSaveParams(params))
      } catch (saveError) {
        if (throwOnError) {
          throw saveError
        }
      }
    } catch (error) {
      setSnapshot({ syncPhase: 'sync-error', descriptorScope: scope })
      if (params.networkMode !== 'lab') {
        try {
          await refreshWalletStoreFromLoadedBdk()
          invalidateOnchainDashboardQueries()
        } catch {
          // Keep prior BDK-local store state when refresh fails.
        }
      }
      params.onSyncError?.(error)
      if (throwOnError) {
        throw error
      }
    }
  })
}

export async function orchestrateOnchainPostUnlockSync(
  params: OnchainPostUnlockSyncParams,
): Promise<void> {
  const awaitCompletion = params.awaitCompletion ?? false
  const work = orchestrateOnchainSyncThenSave({
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
    syncKind: 'postUnlock',
    useFullScan: true,
    markFullScanDone: true,
    onSyncError: params.onSyncError,
    awaitCompletion,
    throwOnError: awaitCompletion,
  })
  if (awaitCompletion) {
    await work
  } else {
    void work
  }
}

/** @internal Test-only reset */
export function resetOnchainSyncLifecycleStateForTests(): void {
  snapshot = {
    syncPhase: 'not-configured',
    descriptorScope: null,
  }
  inFlightSync = null
  listeners.clear()
}
