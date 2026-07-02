import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'
import { markOnchainRailLoadedAfterExternalHydration } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  orchestrateOnchainSyncThenSave,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import {
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import {
  resetLightningSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { isAnyRailSyncing } from '@/lib/wallet/lifecycle/wallet-rail-sync-aggregate'

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

describe('wallet-rail-sync-aggregate', () => {
  beforeEach(() => {
    resetOnchainSyncLifecycleStateForTests()
    resetArkadeSyncLifecycleStateForTests()
    resetLightningSyncLifecycleStateForTests()
    vi.clearAllMocks()
    syncActiveWalletAndUpdateState.mockResolvedValue(undefined)
    orchestrateOnchainSave.mockResolvedValue(undefined)
    markOnchainRailLoadedAfterExternalHydration(onchainScope)
  })

  it('isAnyRailSyncing returns false when all rails idle', () => {
    expect(isAnyRailSyncing()).toBe(false)
  })

  it('isAnyRailSyncing returns true when on-chain syncing', async () => {
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

    await vi.waitFor(() => expect(isAnyRailSyncing()).toBe(true))

    resolveSync()
    await syncPromise
  })
})
