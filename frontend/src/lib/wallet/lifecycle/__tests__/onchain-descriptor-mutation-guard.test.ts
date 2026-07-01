import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'
import { BadLocalChainStateError } from '@/lib/shared/bad-local-chain-state-error'

const awaitOnchainSyncQuiescence = vi.fn()
const awaitOnchainSaveQuiescence = vi.fn()
const awaitOnchainLoadQuiescence = vi.fn()
const exportChangeset = vi.fn()

const syncSnapshot = {
  syncPhase: 'not-syncing' as 'not-syncing' | 'syncing' | 'sync-error',
  descriptorScope: null as null | {
    walletId: number
    networkMode: 'testnet'
    addressType: AddressType
    accountId: number
  },
  errorMessage: null as string | null,
}

const loadSnapshot = {
  loadPhase: 'loaded' as 'loaded' | 'loading',
  networkMode: 'testnet' as const,
  errorMessage: null,
}

const saveSnapshot = {
  savePhase: 'not-saving' as 'not-saving' | 'saving',
  errorMessage: null,
  descriptorScope: null,
}

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  awaitOnchainSyncQuiescence: (...args: unknown[]) => awaitOnchainSyncQuiescence(...args),
  getOnchainSyncLifecycleSnapshot: () => syncSnapshot,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  awaitOnchainLoadQuiescence: (...args: unknown[]) => awaitOnchainLoadQuiescence(...args),
  getOnchainLoadLifecycleSnapshot: () => loadSnapshot,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  awaitOnchainSaveQuiescence: (...args: unknown[]) => awaitOnchainSaveQuiescence(...args),
  getOnchainSaveLifecycleSnapshot: () => saveSnapshot,
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({ exportChangeset }),
  },
}))

import {
  exportChangesetForPersistence,
  exportChangesetForPersistenceBypass,
  OnchainDescriptorMutationBlockedError,
  shouldSkipOutgoingDescriptorSaveOnSyncError,
} from '@/lib/wallet/lifecycle/onchain-descriptor-mutation-guard'

describe('onchain-descriptor-mutation-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    syncSnapshot.syncPhase = 'not-syncing'
    syncSnapshot.errorMessage = null
    loadSnapshot.loadPhase = 'loaded'
    saveSnapshot.savePhase = 'not-saving'
    awaitOnchainSyncQuiescence.mockResolvedValue(undefined)
    awaitOnchainSaveQuiescence.mockResolvedValue(undefined)
    awaitOnchainLoadQuiescence.mockResolvedValue(undefined)
    exportChangeset.mockResolvedValue('{"chain":{}}')
  })

  describe('LIFE-ONC-GUARD-01 export blocked while syncing', () => {
    it('rejects exportChangesetForPersistence when syncPhase is syncing', async () => {
      syncSnapshot.syncPhase = 'syncing'

      await expect(exportChangesetForPersistence()).rejects.toBeInstanceOf(
        OnchainDescriptorMutationBlockedError,
      )
      expect(exportChangeset).not.toHaveBeenCalled()
    })

    it('rejects when loadPhase is loading', async () => {
      loadSnapshot.loadPhase = 'loading'

      await expect(exportChangesetForPersistence()).rejects.toBeInstanceOf(
        OnchainDescriptorMutationBlockedError,
      )
    })

    it('rejects when savePhase is saving', async () => {
      saveSnapshot.savePhase = 'saving'

      await expect(exportChangesetForPersistence()).rejects.toBeInstanceOf(
        OnchainDescriptorMutationBlockedError,
      )
    })
  })

  describe('LIFE-ONC-GUARD-02 export blocked on sync-error', () => {
    it('rejects exportChangesetForPersistence when syncPhase is sync-error', async () => {
      syncSnapshot.syncPhase = 'sync-error'
      syncSnapshot.errorMessage = 'chain mismatch'

      await expect(exportChangesetForPersistence()).rejects.toBeInstanceOf(
        OnchainDescriptorMutationBlockedError,
      )
      expect(exportChangeset).not.toHaveBeenCalled()
    })

    it('shouldSkipOutgoingDescriptorSaveOnSyncError is true on sync-error', () => {
      syncSnapshot.syncPhase = 'sync-error'
      expect(shouldSkipOutgoingDescriptorSaveOnSyncError()).toBe(true)
    })

    it('shouldSkipOutgoingDescriptorSaveOnSyncError is false when not-syncing', () => {
      syncSnapshot.syncPhase = 'not-syncing'
      expect(shouldSkipOutgoingDescriptorSaveOnSyncError()).toBe(false)
    })

    it('allows export when not-syncing after quiescence', async () => {
      await expect(exportChangesetForPersistence()).resolves.toBe('{"chain":{}}')
      expect(awaitOnchainSyncQuiescence).toHaveBeenCalled()
      expect(exportChangeset).toHaveBeenCalled()
    })
  })

  describe('exportChangesetForPersistenceBypass', () => {
    it('exports without lifecycle guard (orchestrator post-sync save)', async () => {
      syncSnapshot.syncPhase = 'sync-error'
      await expect(exportChangesetForPersistenceBypass()).resolves.toBe('{"chain":{}}')
      expect(awaitOnchainSyncQuiescence).not.toHaveBeenCalled()
    })
  })
})

describe('LIFE-ONC-GUARD-03 BadLocalChainStateError sync-error message', () => {
  it('BadLocalChainStateError message is user-facing repair text', () => {
    const error = new BadLocalChainStateError()
    expect(error.message).toMatch(/Full rescan/i)
    expect(error.message).toMatch(/Esplora/i)
  })
})
