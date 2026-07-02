import {
  LIFECYCLE_SAVE_ERROR_FALLBACK,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'
import { withWalletWriterLock } from '@/lib/shared/opfs-writer-lock'
import {
  createInFlightLifecycleTracker,
  getCoalescedInFlightPromise,
  type InFlightLifecycleTracker,
} from '@/lib/wallet/lifecycle/lifecycle-in-flight-tracker'
import type { SaveLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type SaveLifecycleSnapshotBase = {
  savePhase: SaveLifecyclePhase
  errorMessage: string | null
}

export function createSaveBlockingLockErrorClass(
  className: string,
  message: string,
): new () => Error {
  return class SaveBlockingLockError extends Error {
    constructor() {
      super(message)
      this.name = className
    }
  }
}

export type SaveLifecycleOrchestratorConfig<
  TParams,
  TSnapshot extends SaveLifecycleSnapshotBase,
  TScope,
> = {
  blockingLockErrorClass: new () => Error
  saveKey: (params: TParams) => string
  scopeFromParams: (params: TParams) => TScope
  runSaveBody: (params: TParams) => Promise<void>
  notConfiguredSnapshot: TSnapshot
  notSavingSnapshot: (scope: TScope) => TSnapshot
  savingSnapshot: (scope: TScope) => TSnapshot
  saveErrorSnapshot: (scope: TScope, userFacingErrorMessage: string) => TSnapshot
  scopeFromSnapshot: (snapshot: TSnapshot) => TScope | null
  skipConfigureForLoadedRail?: (scope: TScope) => boolean
  onNotifyListeners?: () => void
  saveFailureLogLabel: string
  retrySaveErrorMessage: string
}

export type SaveLifecycleOrchestrator<
  TParams,
  TSnapshot extends SaveLifecycleSnapshotBase,
  TScope,
> = {
  SaveBlockingLockError: new () => Error
  getSaveLifecycleSnapshot: () => TSnapshot
  subscribeSaveLifecycle: (listener: (next: TSnapshot) => void) => () => void
  isSaveBlockingLock: () => boolean
  acknowledgeSaveErrorForForcedLock: () => void
  awaitSaveQuiescence: () => Promise<void>
  configureSaveForLoadedRail: (scope: TScope) => void
  syncSaveLifecycleWithLockPhase: (lockPhase: LockLifecyclePhase) => void
  orchestrateSave: (params: TParams) => Promise<void>
  orchestrateRetrySave: () => Promise<void>
  applySaveLifecycleSnapshot: (next: TSnapshot) => void
  forceResetSaveLifecycleForTeardown: () => void
  resetSaveLifecycleStateForTests: () => void
  getInFlightSaveTracker: () => InFlightLifecycleTracker
}

export function createSaveLifecycleOrchestrator<
  TParams,
  TSnapshot extends SaveLifecycleSnapshotBase,
  TScope,
>(
  config: SaveLifecycleOrchestratorConfig<TParams, TSnapshot, TScope>,
): SaveLifecycleOrchestrator<TParams, TSnapshot, TScope> {
  const inFlightSaveTracker = createInFlightLifecycleTracker()
  let snapshot: TSnapshot = config.notConfiguredSnapshot
  let lastSaveParams: TParams | null = null
  let forcedLockAcknowledged = false
  const listeners = new Set<(next: TSnapshot) => void>()

  function getSaveLifecycleSnapshot(): TSnapshot {
    return { ...snapshot }
  }

  function notifyListeners(): void {
    const current = getSaveLifecycleSnapshot()
    for (const listener of listeners) {
      listener(current)
    }
    config.onNotifyListeners?.()
  }

  function setSnapshot(next: TSnapshot): void {
    snapshot = next
    notifyListeners()
  }

  function isSaveBlockingLock(): boolean {
    return snapshot.savePhase === 'save-error' && !forcedLockAcknowledged
  }

  function acknowledgeSaveErrorForForcedLock(): void {
    forcedLockAcknowledged = true
    if (snapshot.savePhase === 'save-error') {
      const scope = config.scopeFromSnapshot(snapshot)
      if (scope != null) {
        setSnapshot(config.notSavingSnapshot(scope))
      }
    }
  }

  async function awaitSaveQuiescence(): Promise<void> {
    await inFlightSaveTracker.awaitQuiescence()
  }

  function configureSaveForLoadedRail(scope: TScope): void {
    if (snapshot.savePhase !== 'not-configured') {
      return
    }
    if (config.skipConfigureForLoadedRail?.(scope)) {
      return
    }
    setSnapshot(config.notSavingSnapshot(scope))
  }

  function syncSaveLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
    if (
      shouldSkipRailLifecycleResetForLockPhase(
        lockPhase,
        inFlightSaveTracker.getCurrent() != null,
      )
    ) {
      return
    }
    forcedLockAcknowledged = false
    lastSaveParams = null
    setSnapshot(config.notConfiguredSnapshot)
  }

  async function orchestrateSave(params: TParams): Promise<void> {
    const key = config.saveKey(params)
    const coalesced = getCoalescedInFlightPromise(inFlightSaveTracker, key)
    if (coalesced != null) {
      return coalesced
    }

    lastSaveParams = params
    forcedLockAcknowledged = false
    const scope = config.scopeFromParams(params)

    return inFlightSaveTracker.begin(key, async () => {
      setSnapshot(config.savingSnapshot(scope))
      try {
        await withWalletWriterLock(() => config.runSaveBody(params))
        setSnapshot(config.notSavingSnapshot(scope))
      } catch (saveError) {
        console.error(config.saveFailureLogLabel, saveError)
        const userFacingErrorMessage = userFacingLifecycleErrorMessage(
          saveError,
          LIFECYCLE_SAVE_ERROR_FALLBACK,
        )
        setSnapshot(config.saveErrorSnapshot(scope, userFacingErrorMessage))
        throw saveError
      }
    })
  }

  async function orchestrateRetrySave(): Promise<void> {
    if (lastSaveParams == null) {
      throw new Error(config.retrySaveErrorMessage)
    }
    return orchestrateSave(lastSaveParams)
  }

  function applySaveLifecycleSnapshot(next: TSnapshot): void {
    setSnapshot(next)
  }

  function forceResetSaveLifecycleForTeardown(): void {
    inFlightSaveTracker.clearCurrent()
    forcedLockAcknowledged = false
    lastSaveParams = null
    setSnapshot(config.notConfiguredSnapshot)
  }

  function resetSaveLifecycleStateForTests(): void {
    snapshot = config.notConfiguredSnapshot
    inFlightSaveTracker.clearCurrent()
    lastSaveParams = null
    forcedLockAcknowledged = false
    listeners.clear()
  }

  return {
    SaveBlockingLockError: config.blockingLockErrorClass,
    getSaveLifecycleSnapshot,
    subscribeSaveLifecycle(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isSaveBlockingLock,
    acknowledgeSaveErrorForForcedLock,
    awaitSaveQuiescence,
    configureSaveForLoadedRail,
    syncSaveLifecycleWithLockPhase,
    orchestrateSave,
    orchestrateRetrySave,
    applySaveLifecycleSnapshot,
    forceResetSaveLifecycleForTeardown,
    resetSaveLifecycleStateForTests,
    getInFlightSaveTracker: () => inFlightSaveTracker,
  }
}
