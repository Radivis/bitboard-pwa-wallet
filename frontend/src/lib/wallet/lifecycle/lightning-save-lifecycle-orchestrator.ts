import { saveLightningConnectionsForWallet } from '@/lib/lightning/lightning-wallet-secrets'
import { batchApplyNwcSnapshotPatches } from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import { invalidateLightningDashboardQueries, invalidateLightningSyncMetadataQueries } from '@/lib/lightning/lightning-dashboard-sync'
import { sanitizeErrorMessageForUi } from '@/lib/shared/sanitize-error-for-ui'
import { errorMessage } from '@/lib/shared/utils'
import type {
  LightningSaveConnectionsParams,
  LightningSaveLifecycleSnapshot,
  LightningSaveParams,
  LightningSaveSnapshotPatchesParams,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'
import type { LightningRailScope } from '@/lib/wallet/lifecycle/lightning-rail-types'
import { lightningRailScopeKey } from '@/lib/wallet/lifecycle/lightning-rail-types'
import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

export type {
  LightningSaveLifecycleSnapshot,
  LightningSaveParams,
  LightningSaveConnectionsParams,
  LightningSaveSnapshotPatchesParams,
  LightningSaveKind,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'

export class LightningSaveBlockingLockError extends Error {
  constructor() {
    super('Lightning save-error blocks lock until retry or forced lock')
    this.name = 'LightningSaveBlockingLockError'
  }
}

type InFlightSave = {
  key: string
  promise: Promise<void>
}

let snapshot: LightningSaveLifecycleSnapshot = {
  savePhase: 'not-configured',
  errorMessage: null,
  railScope: null,
}

let lastSaveParams: LightningSaveParams | null = null
let forcedLockAcknowledged = false

const listeners = new Set<(next: LightningSaveLifecycleSnapshot) => void>()
let inFlightSave: InFlightSave | null = null

function saveKey(params: LightningSaveParams): string {
  return `${lightningRailScopeKey(params)}:${params.saveKind}`
}

function railScopeFromParams(
  params: Pick<LightningSaveParams, 'walletId' | 'networkMode'>,
): LightningRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
  }
}

function notifyListeners(): void {
  const current = getLightningSaveLifecycleSnapshot()
  for (const listener of listeners) {
    listener(current)
  }
}

function setSnapshot(next: LightningSaveLifecycleSnapshot): void {
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

async function runSaveBody(params: LightningSaveParams): Promise<void> {
  if (params.saveKind === 'connections') {
    await saveLightningConnectionsForWallet({
      walletId: params.walletId,
      connections: params.connections,
    })
    return
  }

  if (params.patches.length === 0) {
    return
  }

  await batchApplyNwcSnapshotPatches({
    walletId: params.walletId,
    patches: params.patches,
  })
  if (params.refreshDashboardQueriesAfterSave) {
    invalidateLightningDashboardQueries()
  } else {
    invalidateLightningSyncMetadataQueries()
  }
}

export function getLightningSaveLifecycleSnapshot(): LightningSaveLifecycleSnapshot {
  return { ...snapshot }
}

export function subscribeLightningSaveLifecycle(
  listener: (next: LightningSaveLifecycleSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isLightningSaveBlockingLock(): boolean {
  return snapshot.savePhase === 'save-error' && !forcedLockAcknowledged
}

export function acknowledgeLightningSaveErrorForForcedLock(): void {
  forcedLockAcknowledged = true
  if (snapshot.savePhase === 'save-error') {
    setSnapshot({
      savePhase: 'not-saving',
      errorMessage: null,
      railScope: snapshot.railScope,
    })
  }
}

export async function awaitLightningSaveQuiescence(): Promise<void> {
  if (inFlightSave != null) {
    await inFlightSave.promise
  }
}

export function configureLightningSaveForLoadedRail(scope: LightningRailScope): void {
  if (snapshot.savePhase !== 'not-configured') {
    return
  }
  setSnapshot({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope: scope,
  })
}

export function syncLightningSaveLifecycleWithLockPhase(lockPhase: LockLifecyclePhase): void {
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

export async function orchestrateLightningSave(params: LightningSaveParams): Promise<void> {
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
      await runSaveBody(params)
      setSnapshot({
        savePhase: 'not-saving',
        errorMessage: null,
        railScope: scope,
      })
    } catch (error) {
      console.error('Lightning save failed', error)
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

export async function orchestrateLightningSaveConnections(
  params: LightningSaveConnectionsParams,
): Promise<void> {
  return orchestrateLightningSave({ ...params, saveKind: 'connections' })
}

export async function orchestrateLightningSaveSnapshotPatches(
  params: LightningSaveSnapshotPatchesParams,
): Promise<void> {
  return orchestrateLightningSave({ ...params, saveKind: 'snapshotPatches' })
}

export async function orchestrateLightningRetrySave(): Promise<void> {
  if (lastSaveParams == null) {
    throw new Error('No Lightning save to retry')
  }
  return orchestrateLightningSave(lastSaveParams)
}

/** @internal Test-only reset */
export function resetLightningSaveLifecycleStateForTests(): void {
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
