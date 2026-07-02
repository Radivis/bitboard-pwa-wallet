import { useCryptoStore } from '@/stores/cryptoStore'
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

function assertNoInFlightOnchainLifecycle(): void {
  const loadSnapshot = getOnchainLoadLifecycleSnapshot()
  if (loadSnapshot.loadPhase === 'loading') {
    throw new OnchainDescriptorMutationBlockedError(
      'On-chain wallet is still loading — try again in a moment.',
    )
  }

  const syncSnapshot = getOnchainSyncLifecycleSnapshot()
  if (syncSnapshot.syncPhase === 'syncing') {
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
  if (syncSnapshot.syncPhase === 'sync-error') {
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
  return getOnchainSyncLifecycleSnapshot().syncPhase === 'sync-error'
}

/**
 * Waits for in-flight on-chain load/sync/save work, then rejects if lifecycle is still busy.
 * Does not block on `sync-error` — use for network/address switch entry.
 */
export async function awaitOnchainQuiescenceBeforeDescriptorMutation(): Promise<void> {
  await awaitOnchainLoadQuiescence()
  await awaitOnchainSyncQuiescence()
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
