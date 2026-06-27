import { saveLightningConnectionsForWallet } from '@/lib/lightning/lightning-wallet-secrets'
import { batchApplyNwcSnapshotPatches } from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import {
  invalidateLightningDashboardQueries,
  invalidateLightningSyncMetadataQueries,
} from '@/lib/lightning/lightning-dashboard-sync'
import type {
  LightningSaveConnectionsParams,
  LightningSaveLifecycleSnapshot,
  LightningSaveParams,
  LightningSaveSnapshotPatchesParams,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'
import type { LightningRailScope } from '@/lib/wallet/lifecycle/lightning-rail-types'
import { lightningRailScopeKey } from '@/lib/wallet/lifecycle/lightning-rail-types'
import {
  createSaveBlockingLockErrorClass,
  createSaveLifecycleOrchestrator,
} from '@/lib/wallet/lifecycle/save-lifecycle-orchestrator-factory'

export type {
  LightningSaveLifecycleSnapshot,
  LightningSaveParams,
  LightningSaveConnectionsParams,
  LightningSaveSnapshotPatchesParams,
  LightningSaveKind,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'

export const LightningSaveBlockingLockError = createSaveBlockingLockErrorClass(
  'LightningSaveBlockingLockError',
  'Lightning save-error blocks lock until retry or forced lock',
)

function railScopeFromParams(
  params: Pick<LightningSaveParams, 'walletId' | 'networkMode'>,
): LightningRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
  }
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

const lightningSaveLifecycle = createSaveLifecycleOrchestrator<
  LightningSaveParams,
  LightningSaveLifecycleSnapshot,
  LightningRailScope
>({
  blockingLockErrorClass: LightningSaveBlockingLockError,
  saveKey: (params) => `${lightningRailScopeKey(params)}:${params.saveKind}`,
  scopeFromParams: railScopeFromParams,
  runSaveBody,
  notConfiguredSnapshot: {
    savePhase: 'not-configured',
    errorMessage: null,
    railScope: null,
  },
  notSavingSnapshot: (railScope) => ({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope,
  }),
  savingSnapshot: (railScope) => ({
    savePhase: 'saving',
    errorMessage: null,
    railScope,
  }),
  saveErrorSnapshot: (railScope, userFacingErrorMessage) => ({
    savePhase: 'save-error',
    errorMessage: userFacingErrorMessage,
    railScope,
  }),
  scopeFromSnapshot: (saveSnapshot) => saveSnapshot.railScope,
  saveFailureLogLabel: 'Lightning save failed',
  retrySaveErrorMessage: 'No Lightning save to retry',
})

export const getLightningSaveLifecycleSnapshot = lightningSaveLifecycle.getSaveLifecycleSnapshot
export const subscribeLightningSaveLifecycle = lightningSaveLifecycle.subscribeSaveLifecycle
export const isLightningSaveBlockingLock = lightningSaveLifecycle.isSaveBlockingLock
export const acknowledgeLightningSaveErrorForForcedLock =
  lightningSaveLifecycle.acknowledgeSaveErrorForForcedLock
export const awaitLightningSaveQuiescence = lightningSaveLifecycle.awaitSaveQuiescence
export const configureLightningSaveForLoadedRail =
  lightningSaveLifecycle.configureSaveForLoadedRail
export const syncLightningSaveLifecycleWithLockPhase =
  lightningSaveLifecycle.syncSaveLifecycleWithLockPhase
export const orchestrateLightningSave = lightningSaveLifecycle.orchestrateSave
export const orchestrateLightningRetrySave = lightningSaveLifecycle.orchestrateRetrySave
export const resetLightningSaveLifecycleStateForTests =
  lightningSaveLifecycle.resetSaveLifecycleStateForTests

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
