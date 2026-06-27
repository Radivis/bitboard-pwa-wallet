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
import {
  awaitDifferentInFlightWork,
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { withWalletWriterLock } from '@/lib/shared/opfs-writer-lock'
import type {
  OnchainPostUnlockSyncParams,
  OnchainSyncLifecycleSnapshot,
  OnchainSyncParams,
  OnchainSyncThenSaveParams,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'
import type { OnchainSaveParams } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

export type {
  OnchainSyncKind,
  OnchainSyncLifecycleSnapshot,
  OnchainSyncParams,
  OnchainSyncThenSaveParams,
  OnchainPostUnlockSyncParams,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'

let snapshot: OnchainSyncLifecycleSnapshot = {
  syncPhase: 'not-configured',
  descriptorScope: null,
  errorMessage: null,
}

const listeners = new Set<(next: OnchainSyncLifecycleSnapshot) => void>()
const inFlightSyncTracker = createInFlightLifecycleTracker()

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
}

function setSnapshot(next: OnchainSyncLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
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
  await inFlightSyncTracker.awaitQuiescence()
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
    errorMessage: null,
  })
  configureOnchainSaveForLoadedRail(scope)
}

export function syncOnchainSyncLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (
    shouldSkipRailLifecycleResetForLockPhase(
      lockPhase,
      inFlightSyncTracker.getCurrent() != null,
    )
  ) {
    return
  }
  setSnapshot({
    syncPhase: 'not-configured',
    descriptorScope: null,
    errorMessage: null,
  })
}

export async function orchestrateOnchainSyncThenSave(
  params: OnchainSyncThenSaveParams,
): Promise<void> {
  const throwOnError = params.throwOnError ?? params.awaitCompletion !== false
  const key = syncKey(params)

  const coalesced = getCoalescedInFlightPromise(inFlightSyncTracker, key)
  if (coalesced != null) {
    return coalesced
  }
  const afterDifferentWork = await awaitDifferentInFlightWork(inFlightSyncTracker, key)
  if (afterDifferentWork != null) {
    return afterDifferentWork
  }

  return inFlightSyncTracker.begin(key, async () => {
    await withWalletWriterLock(async () => {
      assertCanStartOnchainSync(params)
      const scope = descriptorScopeFromParams(params)
      configureOnchainSyncForLoadedRail(scope)

      setSnapshot({ syncPhase: 'syncing', descriptorScope: scope, errorMessage: null })

      try {
        await runEsploraSyncBody(params)
        setSnapshot({ syncPhase: 'not-syncing', descriptorScope: scope, errorMessage: null })
        try {
          await orchestrateOnchainSave(toSaveParams(params))
        } catch (saveError) {
          if (throwOnError) {
            throw saveError
          }
        }
      } catch (error) {
        setSnapshot({
          syncPhase: 'sync-error',
          descriptorScope: scope,
          errorMessage: userFacingLifecycleErrorMessage(error, LIFECYCLE_SYNC_ERROR_FALLBACK),
        })
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
    errorMessage: null,
  }
  inFlightSyncTracker.clearCurrent()
  listeners.clear()
}
