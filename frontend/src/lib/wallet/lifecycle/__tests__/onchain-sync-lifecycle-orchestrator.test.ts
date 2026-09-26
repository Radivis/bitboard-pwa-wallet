import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'
import { BadLocalChainStateError } from '@/lib/shared/bad-local-chain-state-error'

const syncActiveWalletAndUpdateState = vi.fn()
const orchestrateOnchainSave = vi.fn()
const refreshWalletStoreFromLoadedBdk = vi.fn()
const invalidateOnchainDashboardQueries = vi.fn()

const loadSnapshot = { loadPhase: 'loaded' as const, networkMode: 'testnet' as const }
let loadHydration: {
  fullScanDone: boolean
  usedEmptyChainFallback: boolean
} | null = {
  fullScanDone: true,
  usedEmptyChainFallback: false,
}

vi.mock('@/lib/wallet/wallet-utils', () => ({
  syncActiveWalletAndUpdateState: (...args: unknown[]) =>
    syncActiveWalletAndUpdateState(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  getOnchainLoadLifecycleSnapshot: () => loadSnapshot,
  getOnchainLoadHydrationForPostUnlock: () => loadHydration,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  configureOnchainSaveForLoadedRail: vi.fn(),
  orchestrateOnchainSave: (...args: unknown[]) => orchestrateOnchainSave(...args),
}))

vi.mock('@/lib/wallet/onchain-bdk-store-sync', () => ({
  refreshWalletStoreFromLoadedBdk: (...args: unknown[]) =>
    refreshWalletStoreFromLoadedBdk(...args),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  invalidateOnchainDashboardQueries: (...args: unknown[]) =>
    invalidateOnchainDashboardQueries(...args),
}))

const walletStoreState = {
  walletStatus: 'unlocked' as 'unlocked' | 'locked',
  activeWalletId: 1 as number | null,
  setWalletStatus: vi.fn(),
}

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => walletStoreState,
    },
  }
})

import {
  getOnchainSyncLifecycleSnapshot,
  orchestrateOnchainPostUnlockSync,
  orchestrateOnchainSyncThenSave,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'

const syncParams = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
  syncKind: 'incrementalDashboard' as const,
  useFullScan: false,
  markFullScanDone: false,
}

describe('onchain-sync-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetOnchainSyncLifecycleStateForTests()
    vi.clearAllMocks()
    loadSnapshot.loadPhase = 'loaded'
    loadSnapshot.networkMode = 'testnet'
    loadHydration = {
      fullScanDone: true,
      usedEmptyChainFallback: false,
    }
    walletStoreState.walletStatus = 'unlocked'
    walletStoreState.activeWalletId = 1
    syncActiveWalletAndUpdateState.mockResolvedValue(undefined)
    orchestrateOnchainSave.mockResolvedValue(undefined)
    refreshWalletStoreFromLoadedBdk.mockResolvedValue(undefined)
  })

  it('skips sync and save when the active wallet is different', async () => {
    walletStoreState.activeWalletId = 2

    await orchestrateOnchainSyncThenSave(syncParams)

    expect(syncActiveWalletAndUpdateState).not.toHaveBeenCalled()
    expect(orchestrateOnchainSave).not.toHaveBeenCalled()
  })

  it('does not save when the active wallet changes during sync', async () => {
    syncActiveWalletAndUpdateState.mockImplementation(async () => {
      walletStoreState.activeWalletId = 2
    })

    await orchestrateOnchainSyncThenSave(syncParams)

    expect(orchestrateOnchainSave).not.toHaveBeenCalled()
    expect(getOnchainSyncLifecycleSnapshot().syncPhase).toBe('not-configured')
  })

  it('sync rejected when load not loaded', async () => {
    loadSnapshot.loadPhase = 'not-configured'

    await expect(orchestrateOnchainSyncThenSave(syncParams)).rejects.toThrow(
      'On-chain sync requires loaded WASM wallet',
    )
  })

  it('sync success syncing to not-syncing before save starts', async () => {
    const phaseOrder: string[] = []
    syncActiveWalletAndUpdateState.mockImplementation(async () => {
      phaseOrder.push(`sync:${getOnchainSyncLifecycleSnapshot().syncPhase}`)
    })
    orchestrateOnchainSave.mockImplementation(async () => {
      phaseOrder.push(`save-start:${getOnchainSyncLifecycleSnapshot().syncPhase}`)
    })

    await orchestrateOnchainSyncThenSave(syncParams)

    expect(phaseOrder).toEqual(['sync:syncing', 'save-start:not-syncing'])
    expect(getOnchainSyncLifecycleSnapshot().syncPhase).toBe('not-syncing')
    expect(orchestrateOnchainSave).toHaveBeenCalled()
  })

  it('sync failure sets sync-error without save', async () => {
    syncActiveWalletAndUpdateState.mockRejectedValue(new Error('esplora down'))

    await expect(orchestrateOnchainSyncThenSave(syncParams)).rejects.toThrow('esplora down')
    expect(getOnchainSyncLifecycleSnapshot().syncPhase).toBe('sync-error')
    expect(orchestrateOnchainSave).not.toHaveBeenCalled()
    expect(refreshWalletStoreFromLoadedBdk).toHaveBeenCalled()
  })

  it('duplicate sync coalesces', async () => {
    let resolveSync!: () => void
    const syncGate = new Promise<void>((resolve) => {
      resolveSync = resolve
    })
    syncActiveWalletAndUpdateState.mockImplementation(() => syncGate)

    const first = orchestrateOnchainSyncThenSave(syncParams)
    const second = orchestrateOnchainSyncThenSave(syncParams)

    await vi.waitFor(() =>
      expect(getOnchainSyncLifecycleSnapshot().syncPhase).toBe('syncing'),
    )
    resolveSync()
    await Promise.all([first, second])

    expect(syncActiveWalletAndUpdateState).toHaveBeenCalledTimes(1)
  })

  it('sync success does not mutate walletStatus', async () => {
    await orchestrateOnchainSyncThenSave(syncParams)

    expect(walletStoreState.setWalletStatus).not.toHaveBeenCalled()
  })

  it('lab network rejects sync', async () => {
    await expect(
      orchestrateOnchainSyncThenSave({
        ...syncParams,
        networkMode: 'lab',
      }),
    ).rejects.toThrow('On-chain sync is not configured on lab network')
  })

  describe('LIFE-ONC-SYNC-02 postUnlock scan policy', () => {
    const postUnlockParams = {
      walletId: 1,
      networkMode: 'testnet' as const,
      addressType: AddressType.Taproot,
      accountId: 0,
      awaitCompletion: true,
    }

    it('is incremental when fullScanDone and no empty-chain fallback', async () => {
      await orchestrateOnchainPostUnlockSync(postUnlockParams)

      expect(syncActiveWalletAndUpdateState).toHaveBeenCalledWith('testnet', {
        useFullScan: false,
        walletId: 1,
      })
      expect(orchestrateOnchainSave).toHaveBeenCalledWith(
        expect.objectContaining({ markFullScanDone: false }),
      )
    })

    it('full-scans when fullScanDone is false', async () => {
      loadHydration = {
        fullScanDone: false,
        usedEmptyChainFallback: false,
      }

      await orchestrateOnchainPostUnlockSync(postUnlockParams)

      expect(syncActiveWalletAndUpdateState).toHaveBeenCalledWith('testnet', {
        useFullScan: true,
        walletId: 1,
      })
      expect(orchestrateOnchainSave).toHaveBeenCalledWith(
        expect.objectContaining({ markFullScanDone: true }),
      )
    })

    it('full-scans when empty-chain fallback was used', async () => {
      loadHydration = {
        fullScanDone: true,
        usedEmptyChainFallback: true,
      }

      await orchestrateOnchainPostUnlockSync(postUnlockParams)

      expect(syncActiveWalletAndUpdateState).toHaveBeenCalledWith('testnet', {
        useFullScan: true,
        walletId: 1,
      })
      expect(orchestrateOnchainSave).toHaveBeenCalledWith(
        expect.objectContaining({ markFullScanDone: true }),
      )
    })

    it('postUnlock_full_scans_when_hydration_is_missing', async () => {
      loadHydration = null

      await orchestrateOnchainPostUnlockSync(postUnlockParams)

      expect(syncActiveWalletAndUpdateState).toHaveBeenCalledWith('testnet', {
        useFullScan: true,
        walletId: 1,
      })
      expect(orchestrateOnchainSave).toHaveBeenCalledWith(
        expect.objectContaining({ markFullScanDone: true }),
      )
    })
  })

  describe('LIFE-ONC-GUARD-03 BadLocalChainStateError', () => {
    it('sets sync-error with repair-oriented errorMessage', async () => {
      syncActiveWalletAndUpdateState.mockRejectedValue(new BadLocalChainStateError())

      await expect(orchestrateOnchainSyncThenSave(syncParams)).rejects.toBeInstanceOf(
        BadLocalChainStateError,
      )

      const snapshot = getOnchainSyncLifecycleSnapshot()
      expect(snapshot.syncPhase).toBe('sync-error')
      expect(snapshot.errorMessage).toMatch(/Full rescan/i)
    })
  })
})
