import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const applyOnchainLoadLifecycleSnapshotFromOtherTab = vi.fn()
const applyOnchainSyncLifecycleSnapshotFromRemote = vi.fn()
const applyOnchainSaveLifecycleSnapshotFromRemote = vi.fn()
const localDescriptorScopeMatchesRemote = vi.fn()

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  applyOnchainLoadLifecycleSnapshotFromOtherTab: (...args: unknown[]) =>
    applyOnchainLoadLifecycleSnapshotFromOtherTab(...args),
  getOnchainLoadLifecycleSnapshot: () => ({
    loadPhase: 'loaded',
    networkMode: 'testnet',
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  applyOnchainSyncLifecycleSnapshotFromRemote: (...args: unknown[]) =>
    applyOnchainSyncLifecycleSnapshotFromRemote(...args),
  getOnchainSyncLifecycleSnapshot: () => ({
    syncPhase: 'syncing',
    descriptorScope: null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  applyOnchainSaveLifecycleSnapshotFromRemote: (...args: unknown[]) =>
    applyOnchainSaveLifecycleSnapshotFromRemote(...args),
  getOnchainSaveLifecycleSnapshot: () => ({
    savePhase: 'not-saving',
    errorMessage: null,
    descriptorScope: null,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-rail-snapshot', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/onchain-rail-snapshot')
  >()
  return {
    ...actual,
    getLocalOnchainRailDescriptorScope: () => ({
      walletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
    }),
    localDescriptorScopeMatchesRemote: (...args: unknown[]) =>
      localDescriptorScopeMatchesRemote(...args),
    getOnchainRailSnapshot: () => ({
      loadPhase: 'loaded',
      syncPhase: 'syncing',
      savePhase: 'not-saving',
    }),
  }
})

import { applyOnchainRailSnapshotFromOtherTab } from '@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync'
import type { OnchainRailLifecycleBroadcastMessage } from '@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync'

const baseMessage: OnchainRailLifecycleBroadcastMessage = {
  sourceTabId: 'other-tab',
  time: Date.now(),
  descriptorScope: {
    walletId: 1,
    networkMode: 'testnet',
    addressType: AddressType.Taproot,
    accountId: 0,
  },
  loadSnapshot: { loadPhase: 'loaded', networkMode: 'testnet' },
  syncSnapshot: { syncPhase: 'syncing', descriptorScope: null },
  saveSnapshot: { savePhase: 'not-saving', errorMessage: null, descriptorScope: null },
  railSnapshot: {
    loadPhase: 'loaded',
    syncPhase: 'syncing',
    savePhase: 'not-saving',
  },
}

describe('onchain-rail-lifecycle-cross-tab-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localDescriptorScopeMatchesRemote.mockReturnValue(true)
  })

  it('cross-tab applies when descriptorScope matches', () => {
    applyOnchainRailSnapshotFromOtherTab(baseMessage)

    expect(applyOnchainLoadLifecycleSnapshotFromOtherTab).toHaveBeenCalledWith(
      baseMessage.loadSnapshot,
    )
    expect(applyOnchainSyncLifecycleSnapshotFromRemote).toHaveBeenCalledWith(
      baseMessage.syncSnapshot,
    )
    expect(applyOnchainSaveLifecycleSnapshotFromRemote).toHaveBeenCalledWith(
      baseMessage.saveSnapshot,
    )
  })

  it('cross-tab ignores when scope differs', () => {
    localDescriptorScopeMatchesRemote.mockReturnValue(false)

    applyOnchainRailSnapshotFromOtherTab(baseMessage)

    expect(applyOnchainLoadLifecycleSnapshotFromOtherTab).not.toHaveBeenCalled()
    expect(applyOnchainSyncLifecycleSnapshotFromRemote).not.toHaveBeenCalled()
    expect(applyOnchainSaveLifecycleSnapshotFromRemote).not.toHaveBeenCalled()
  })
})
