import { exportChangesetForPersistenceBypass } from '@/lib/wallet/lifecycle/onchain-descriptor-mutation-guard'
import { useWalletStore } from '@/stores/walletStore'
import { invalidateOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { updateDescriptorWalletChangeset } from '@/lib/wallet/descriptor-wallet-manager'
import type {
  OnchainSaveLifecycleSnapshot,
  OnchainSaveParams,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import {
  createSaveBlockingLockErrorClass,
  createSaveLifecycleOrchestrator,
} from '@/lib/wallet/lifecycle/save-lifecycle-orchestrator-factory'

export type { OnchainSaveLifecycleSnapshot, OnchainSaveParams } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

export const OnchainSaveBlockingLockError = createSaveBlockingLockErrorClass(
  'OnchainSaveBlockingLockError',
  'On-chain save-error blocks lock until retry or forced lock',
)

function descriptorScopeFromParams(params: OnchainSaveParams): OnchainRailDescriptorScope {
  return {
    walletId: params.walletId,
    networkMode: params.networkMode,
    addressType: params.addressType,
    accountId: params.accountId,
  }
}

async function runPersistPostEsploraSync(params: OnchainSaveParams): Promise<void> {
  const syncedAtIso = new Date().toISOString()
  useWalletStore.getState().setLastSyncTime(new Date(syncedAtIso))

  const changesetJson = await exportChangesetForPersistenceBypass()

  if (params.descriptorWalletCoordinates != null) {
    const { network, addressType, accountId } = params.descriptorWalletCoordinates
    await updateDescriptorWalletChangeset({
      walletId: params.walletId,
      network,
      addressType,
      accountId,
      changesetJson,
      markFullScanDone: params.markFullScanDone,
      lastSuccessfulEsploraSyncAt: syncedAtIso,
    })
  } else {
    const { loadedDescriptorWallet, networkMode, addressType, accountId } =
      useWalletStore.getState()
    const descriptorContext = loadedDescriptorWallet ?? {
      networkMode,
      addressType,
      accountId,
    }
    await updateDescriptorWalletChangeset({
      walletId: params.walletId,
      network: toBitcoinNetwork(descriptorContext.networkMode),
      addressType: descriptorContext.addressType,
      accountId: descriptorContext.accountId,
      changesetJson,
      markFullScanDone: params.markFullScanDone,
      lastSuccessfulEsploraSyncAt: syncedAtIso,
    })
  }
  invalidateOnchainDashboardQueries()
}

const onchainSaveLifecycle = createSaveLifecycleOrchestrator<
  OnchainSaveParams,
  OnchainSaveLifecycleSnapshot,
  OnchainRailDescriptorScope
>({
  blockingLockErrorClass: OnchainSaveBlockingLockError,
  saveKey: (params) =>
    `${params.walletId}:${params.networkMode}:${params.addressType}:${params.accountId}`,
  scopeFromParams: descriptorScopeFromParams,
  runSaveBody: runPersistPostEsploraSync,
  notConfiguredSnapshot: {
    savePhase: 'not-configured',
    errorMessage: null,
    descriptorScope: null,
  },
  notSavingSnapshot: (descriptorScope) => ({
    savePhase: 'not-saving',
    errorMessage: null,
    descriptorScope,
  }),
  savingSnapshot: (descriptorScope) => ({
    savePhase: 'saving',
    errorMessage: null,
    descriptorScope,
  }),
  saveErrorSnapshot: (descriptorScope, userFacingErrorMessage) => ({
    savePhase: 'save-error',
    errorMessage: userFacingErrorMessage,
    descriptorScope,
  }),
  scopeFromSnapshot: (saveSnapshot) => saveSnapshot.descriptorScope,
  skipConfigureForLoadedRail: (descriptorScope) => descriptorScope.networkMode === 'lab',
  saveFailureLogLabel: 'Onchain save failed',
  retrySaveErrorMessage: 'No on-chain save to retry',
})

export const getOnchainSaveLifecycleSnapshot = onchainSaveLifecycle.getSaveLifecycleSnapshot
export const subscribeOnchainSaveLifecycle = onchainSaveLifecycle.subscribeSaveLifecycle
export const isOnchainSaveBlockingLock = onchainSaveLifecycle.isSaveBlockingLock
export const acknowledgeOnchainSaveErrorForForcedLock =
  onchainSaveLifecycle.acknowledgeSaveErrorForForcedLock
export const awaitOnchainSaveQuiescence = onchainSaveLifecycle.awaitSaveQuiescence
export const configureOnchainSaveForLoadedRail = onchainSaveLifecycle.configureSaveForLoadedRail
export const syncOnchainSaveLifecycleWithLockPhase =
  onchainSaveLifecycle.syncSaveLifecycleWithLockPhase
export const orchestrateOnchainSave = onchainSaveLifecycle.orchestrateSave
export const orchestrateOnchainRetrySave = onchainSaveLifecycle.orchestrateRetrySave
export const resetOnchainSaveLifecycleStateForTests =
  onchainSaveLifecycle.resetSaveLifecycleStateForTests
