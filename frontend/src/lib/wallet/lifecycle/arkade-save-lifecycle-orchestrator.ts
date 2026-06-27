import { useWalletStore } from '@/stores/walletStore'
import { saveLastSuccessfulOperatorSyncAtEncrypted } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { invalidateArkadeDashboardQueries } from '@/lib/arkade/arkade-dashboard-sync'
import type {
  ArkadeSaveLifecycleSnapshot,
  ArkadeSaveParams,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'
import { arkadeRailScopeKey } from '@/lib/wallet/lifecycle/arkade-rail-types'
import {
  createSaveBlockingLockErrorClass,
  createSaveLifecycleOrchestrator,
} from '@/lib/wallet/lifecycle/save-lifecycle-orchestrator-factory'

export type { ArkadeSaveLifecycleSnapshot, ArkadeSaveParams } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'

export const ArkadeSaveBlockingLockError = createSaveBlockingLockErrorClass(
  'ArkadeSaveBlockingLockError',
  'Arkade save-error blocks lock until retry or forced lock',
)

function railScopeFromParams(params: ArkadeSaveParams): ArkadeRailScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    connectionId: params.connectionId,
  }
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

const arkadeSaveLifecycle = createSaveLifecycleOrchestrator<
  ArkadeSaveParams,
  ArkadeSaveLifecycleSnapshot,
  ArkadeRailScope
>({
  blockingLockErrorClass: ArkadeSaveBlockingLockError,
  saveKey: arkadeRailScopeKey,
  scopeFromParams: railScopeFromParams,
  runSaveBody: runPersistOperatorSyncMetadata,
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
  quiescenceSwallowError: true,
  saveFailureLogLabel: 'Arkade save failed',
  retrySaveErrorMessage: 'No Arkade save to retry',
})

export const getArkadeSaveLifecycleSnapshot = arkadeSaveLifecycle.getSaveLifecycleSnapshot
export const subscribeArkadeSaveLifecycle = arkadeSaveLifecycle.subscribeSaveLifecycle
export const isArkadeSaveBlockingLock = arkadeSaveLifecycle.isSaveBlockingLock
export const acknowledgeArkadeSaveErrorForForcedLock =
  arkadeSaveLifecycle.acknowledgeSaveErrorForForcedLock
export const awaitArkadeSaveQuiescence = arkadeSaveLifecycle.awaitSaveQuiescence
export const configureArkadeSaveForLoadedRail = arkadeSaveLifecycle.configureSaveForLoadedRail
export const syncArkadeSaveLifecycleWithLockPhase =
  arkadeSaveLifecycle.syncSaveLifecycleWithLockPhase
export const orchestrateArkadeSave = arkadeSaveLifecycle.orchestrateSave
export const orchestrateArkadeRetrySave = arkadeSaveLifecycle.orchestrateRetrySave
export const resetArkadeSaveLifecycleStateForTests =
  arkadeSaveLifecycle.resetSaveLifecycleStateForTests
export const forceResetArkadeSaveLifecycleForTeardown =
  arkadeSaveLifecycle.forceResetSaveLifecycleForTeardown
