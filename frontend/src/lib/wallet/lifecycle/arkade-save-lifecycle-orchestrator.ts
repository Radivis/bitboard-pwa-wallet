import { useWalletStore } from '@/stores/walletStore'
import { saveLastSuccessfulOperatorSyncAtEncrypted } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { invalidateArkadeDashboardQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import type {
  ArkadeSaveLifecycleSnapshot,
  ArkadeSaveParams,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'
import { arkadeRailScopeKey } from '@/lib/wallet/lifecycle/arkade-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

export type { ArkadeSaveLifecycleSnapshot, ArkadeSaveParams } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'

export class ArkadeSaveBlockingLockError extends Error {
  constructor() {
    super('Arkade save-error blocks lock until retry or forced lock')
    this.name = 'ArkadeSaveBlockingLockError'
  }
}

type InFlightSave = {
  key: string
  promise: Promise<void>
}

let snapshot: ArkadeSaveLifecycleSnapshot = {
  savePhase: 'not-configured',
  errorMessage: null,
  railScope: null,
}

let lastSaveParams: ArkadeSaveParams | null = null
let forcedLockAcknowledged = false

const listeners = new Set<(next: ArkadeSaveLifecycleSnapshot) => void>()
let inFlightSave: InFlightSave | null = null

function saveKey(params: ArkadeSaveParams): string {
  return arkadeRailScopeKey(params)
}

function railScopeFromParams(params: ArkadeSaveParams): ArkadeRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }
}

function notifyListeners(): void {
  const current = getArkadeSaveLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: ArkadeSaveLifecycleSnapshot): void {
  snapshot = next
  notifyListeners()
}

function clearInFlightSave(work: InFlightSave): void {
  if (inFlightSave === work) {
    inFlightSave = null
  }
}

function beginInFlightSave(key: string, run: () => Promise<void>): Promise<void> {
  let resolveWork!: () => void
  let rejectWork!: (error: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolveWork = resolve
    rejectWork = reject
  })
  const work: InFlightSave = { key, promise }
  inFlightSave = work
  void (async () => {
    try {
      await run()
      resolveWork()
    } catch (error) {
      rejectWork(error)
    } finally {
      clearInFlightSave(work)
    }
  })()
  return promise
}

async function runPersistOperatorSyncMetadata(params: ArkadeSaveParams): Promise<void> {
  const now = new Date().toISOString()
  await saveLastSuccessfulOperatorSyncAtEncrypted({
    walletId: params.walletId,
    connectionId: params.connectionId,
    lastSuccessfulOperatorSyncAt: now,
  })
  useWalletStore.getState().setLastOperatorSyncTime(new Date())
  invalidateArkadeDashboardQueries()
}

export function getArkadeSaveLifecycleSnapshot(): ArkadeSaveLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeArkadeSaveLifecycle(
  listener: (next: ArkadeSaveLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isArkadeSaveBlockingLock(): boolean {
  return snapshot.savePhase === 'save-error' && !forcedLockAcknowledged
}

export function acknowledgeArkadeSaveErrorForForcedLock(): void {
  forcedLockAcknowledged = true
  if (snapshot.savePhase === 'save-error') {
    setSnapshot({
      savePhase: 'not-saving',
      errorMessage: null,
      railScope: snapshot.railScope,
    })
  }
}

export async function awaitArkadeSaveQuiescence(): Promise<void> {
  if (inFlightSave != null) {
    await inFlightSave.promise
  }
}

export function configureArkadeSaveForLoadedRail(scope: ArkadeRailScope): void {
  if (snapshot.savePhase !== 'not-configured') {
    return
  }
  setSnapshot({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope: scope,
  })
}

export function syncArkadeSaveLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
  if (lockPhase === 'unlocking' || lockPhase === 'unlocked') {
    return
  }
  if (inFlightSave != null) {
    return
  }
  forcedLockAcknowledged = false
  lastSaveParams = null
  setSnapshot({
    savePhase: 'not-configured',
    errorMessage: null,
    railScope: null,
  })
}

export async function orchestrateArkadeSave(params: ArkadeSaveParams): Promise<void> {
  const key = saveKey(params)
  if (inFlightSave?.key === key) {
    return inFlightSave.promise
  }

  lastSaveParams = params
  forcedLockAcknowledged = false
  const scope = railScopeFromParams(params)

  return beginInFlightSave(key, async () => {
    setSnapshot({
      savePhase: 'saving',
      errorMessage: null,
      railScope: scope,
    })
    try {
      await runPersistOperatorSyncMetadata(params)
      setSnapshot({
        savePhase: 'not-saving',
        errorMessage: null,
        railScope: scope,
      })
    } catch (error) {
      console.error('Arkade save failed', error)
      const userFacingErrorMessage =
        sanitizeErrorMessageForUi(errorMessage(error) ?? String(error)) ||
        'Save failed'
      setSnapshot({
        savePhase: 'save-error',
        errorMessage: userFacingErrorMessage,
        railScope: scope,
      })
      throw error
    }
  })
}

export async function orchestrateArkadeRetrySave(): Promise<void> {
  if (lastSaveParams == null) {
    throw new Error('No Arkade save to retry')
  }
  return orchestrateArkadeSave(lastSaveParams)
}

/** @internal Test-only reset */
export function resetArkadeSaveLifecycleStateForTests(): void {
  snapshot = {
    savePhase: 'not-configured',
    errorMessage: null,
    railScope: null,
  }
  inFlightSave = null
  lastSaveParams = null
  forcedLockAcknowledged = false
  listeners.clear()
}
