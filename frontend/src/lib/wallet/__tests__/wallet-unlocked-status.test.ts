import { beforeEach, describe, expect, it } from 'vitest'
import { applyOnchainSyncLifecycleSnapshotFromRemote } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { resetOnchainSyncLifecycleStateForTests } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { AddressType } from '@/stores/walletStore'

describe('walletIsUnlockedOrSyncing', () => {
  beforeEach(() => {
    resetOnchainSyncLifecycleStateForTests()
  })

  it('returns true when wallet is unlocked', () => {
    expect(walletIsUnlockedOrSyncing('unlocked')).toBe(true)
  })

  it('returns true when any rail is syncing even if wallet status is unlocked', () => {
    applyOnchainSyncLifecycleSnapshotFromRemote({
      syncPhase: 'syncing',
      descriptorScope: {
        walletId: 1,
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    })

    expect(walletIsUnlockedOrSyncing('locked')).toBe(true)
  })

  it('returns false when locked and no rail sync in flight', () => {
    expect(walletIsUnlockedOrSyncing('locked')).toBe(false)
  })
})
