import { useWalletStore } from '@/stores/walletStore'
import { getOnchainLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { getOnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { getOnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'
import type { OnchainRailSnapshot } from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type { OnchainRailDescriptorScope } from '@/lib/wallet/lifecycle/onchain-rail-types'

export function getOnchainRailSnapshot(): OnchainRailSnapshot {
  const loadSnapshot = getOnchainLoadLifecycleSnapshot()
  const { loadPhase, networkMode } = loadSnapshot

  if (loadPhase === 'not-configured') {
    return {
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    }
  }
  if (loadPhase === 'load-error') {
    return {
      loadPhase: 'load-error',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    }
  }

  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  const saveSnapshot = getOnchainSaveLifecycleSnapshot()

  if (networkMode === 'lab') {
    return {
      loadPhase,
      syncPhase: 'not-configured',
      savePhase: saveSnapshot.savePhase === 'not-configured' ? 'not-saving' : saveSnapshot.savePhase,
    }
  }

  return {
    loadPhase,
    syncPhase: syncSnapshot.syncPhase,
    savePhase: saveSnapshot.savePhase,
  }
}

export function getLocalOnchainRailDescriptorScope(): OnchainRailDescriptorScope | null {
  const loadSnapshot = getOnchainLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase !== 'loaded' || loadSnapshot.networkMode == null) {
    return null
  }

  const walletState = useWalletStore.getState()
  if (walletState.activeWalletId == null) {
    return null
  }

  const loadedDescriptorWallet = walletState.loadedDescriptorWallet
  const networkMode = loadedDescriptorWallet?.networkMode ?? walletState.networkMode
  const addressType = loadedDescriptorWallet?.addressType ?? walletState.addressType
  const accountId = loadedDescriptorWallet?.accountId ?? walletState.accountId

  return {
    walletId: walletState.activeWalletId,
    networkMode,
    addressType,
    accountId,
  }
}

export function localDescriptorScopeMatchesRemote(
  remoteScope: OnchainRailDescriptorScope,
): boolean {
  const localScope = getLocalOnchainRailDescriptorScope()
  if (localScope == null) {
    return false
  }
  return (
    localScope.walletId === remoteScope.walletId &&
    localScope.networkMode === remoteScope.networkMode &&
    localScope.addressType === remoteScope.addressType &&
    localScope.accountId === remoteScope.accountId
  )
}
