import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markOnchainRailLoadedAfterExternalHydration } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  orchestrateOnchainSyncThenSave,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { AddressType } from '@/stores/walletStore'

const syncActiveWalletAndUpdateState = vi.fn()
const orchestrateOnchainSave = vi.fn()

vi.mock('@/lib/wallet/wallet-utils', () => ({
  syncActiveWalletAndUpdateState: (...args: unknown[]) =>
    syncActiveWalletAndUpdateState(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  configureOnchainSaveForLoadedRail: vi.fn(),
  orchestrateOnchainSave: (...args: unknown[]) => orchestrateOnchainSave(...args),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: {
      getState: () => ({ walletStatus: 'unlocked' as const }),
    },
  }
})

const onchainScope = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
}

describe('walletIsUnlockedOrSyncing', () => {
  beforeEach(() => {
    resetOnchainSyncLifecycleStateForTests()
    vi.clearAllMocks()
    syncActiveWalletAndUpdateState.mockResolvedValue(undefined)
    orchestrateOnchainSave.mockResolvedValue(undefined)
    markOnchainRailLoadedAfterExternalHydration(onchainScope)
  })

  it('returns true when wallet is unlocked', () => {
    expect(walletIsUnlockedOrSyncing('unlocked')).toBe(true)
  })

  it('returns true when any rail is syncing even if wallet status is locked', async () => {
    let resolveSync!: () => void
    const syncGate = new Promise<void>((resolve) => {
      resolveSync = resolve
    })
    syncActiveWalletAndUpdateState.mockImplementation(() => syncGate)

    const syncPromise = orchestrateOnchainSyncThenSave({
      ...onchainScope,
      syncKind: 'incrementalDashboard',
      useFullScan: false,
      markFullScanDone: false,
    })

    await vi.waitFor(() => expect(walletIsUnlockedOrSyncing('locked')).toBe(true))

    resolveSync()
    await syncPromise
  })

  it('returns false when locked and no rail sync in flight', () => {
    expect(walletIsUnlockedOrSyncing('locked')).toBe(false)
  })
})
