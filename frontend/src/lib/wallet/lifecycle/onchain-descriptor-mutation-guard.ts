import { useCryptoStore } from '@/stores/cryptoStore'
import { useWalletStore } from '@/stores/walletStore'
import type { OnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-types'
import {
  awaitOnchainLoadQuiescence,
  getOnchainLoadLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  awaitOnchainSaveQuiescence,
  getOnchainSaveLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import {
  awaitOnchainSyncQuiescence,
  getOnchainSyncLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'

/** Thrown when a descriptor mutation cannot run safely (in-flight lifecycle or sync-error persist block). */
export class OnchainDescriptorMutationBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnchainDescriptorMutationBlockedError'
  }
}

/**
 * A snapshot with no scope is treated as applying to the loaded wallet.
 * A scope for another descriptor (for example a testnet scan left running
 * after Lab was loaded) must not block the wallet that is loaded now.
 */
function syncSnapshotAppliesToLoadedDescriptor(
  syncSnapshot: OnchainSyncLifecycleSnapshot,
): boolean {
  const scope = syncSnapshot.descriptorScope
  if (scope == null) return true
  const state = useWalletStore.getState()
  return (
    state.activeWalletId === scope.walletId &&
    state.networkMode === scope.networkMode &&
    state.addressType === scope.addressType &&
    state.accountId === scope.accountId
  )
}

function inFlightSyncBlocksDescriptorMutation(): boolean {
  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  return (
    syncSnapshot.syncPhase === 'syncing' &&
    syncSnapshotAppliesToLoadedDescriptor(syncSnapshot)
  )
}

function assertNoInFlightOnchainLifecycle(): void {
  const loadSnapshot = getOnchainLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase === 'loading') {
    throw new OnchainDescriptorMutationBlockedError(
      'On-chain wallet is still loading — try again in a moment.',
    )
  }

  if (inFlightSyncBlocksDescriptorMutation()) {
    throw new OnchainDescriptorMutationBlockedError(
      'On-chain sync is in progress — wait for it to finish.',
    )
  }

  const saveSnapshot = getOnchainSaveLifecycleSnapshot()
  if (saveSnapshot.savePhase === 'saving') {
    throw new OnchainDescriptorMutationBlockedError(
      'On-chain save is in progress — wait for it to finish.',
    )
  }
}

function assertChangesetPersistenceAllowed(): void {
  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  if (
    syncSnapshot.syncPhase === 'sync-error' &&
    syncSnapshotAppliesToLoadedDescriptor(syncSnapshot)
  ) {
    const detail = syncSnapshot.errorMessage?.trim()
    throw new OnchainDescriptorMutationBlockedError(
      detail
        ? `Cannot save wallet chain data while sync failed: ${detail}`
        : 'Cannot save wallet chain data while on-chain sync has failed — repair sync first.',
    )
  }
}

/** True when outgoing descriptor save must be skipped (preserve last good persisted changeset). */
export function shouldSkipOutgoingDescriptorSaveOnSyncError(): boolean {
  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  return (
    syncSnapshot.syncPhase === 'sync-error' &&
    syncSnapshotAppliesToLoadedDescriptor(syncSnapshot)
  )
}

/**
 * Waits for in-flight on-chain load/sync/save work, then rejects if lifecycle is still busy.
 * A scan whose descriptor is no longer loaded does not block. Does not block on `sync-error`.
 */
export async function awaitOnchainQuiescenceBeforeDescriptorMutation(): Promise<void> {
  await awaitOnchainLoadQuiescence()
  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  const foreignInFlightScan =
    syncSnapshot.syncPhase === 'syncing' &&
    !syncSnapshotAppliesToLoadedDescriptor(syncSnapshot)
  if (!foreignInFlightScan) {
    await awaitOnchainSyncQuiescence()
  }
  await awaitOnchainSaveQuiescence()
  assertNoInFlightOnchainLifecycle()
}

/**
 * Export WASM changeset for persistence (switch outgoing save, send, new receive address).
 * Blocked during in-flight lifecycle and while `syncPhase === 'sync-error'`.
 */
export async function exportChangesetForPersistence(): Promise<string> {
  await awaitOnchainQuiescenceBeforeDescriptorMutation()
  assertChangesetPersistenceAllowed()
  return useCryptoStore.getState().exportChangeset()
}

/** Post-successful-sync save path only — bypasses sync-error guard. */
export async function exportChangesetForPersistenceBypass(): Promise<string> {
  return useCryptoStore.getState().exportChangeset()
}
