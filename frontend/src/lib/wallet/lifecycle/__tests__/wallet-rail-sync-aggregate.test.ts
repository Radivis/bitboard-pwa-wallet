import { beforeEach, describe, expect, it } from 'vitest'
import { AddressType } from '@/stores/walletStore'
import {
  applyOnchainSyncLifecycleSnapshotFromRemote,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import {
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import {
  resetLightningSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { isAnyRailSyncing } from '@/lib/wallet/lifecycle/wallet-rail-sync-aggregate'

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
  })

  it('isAnyRailSyncing returns false when all rails idle', () => {
    applyOnchainSyncLifecycleSnapshotFromRemote({
      syncPhase: 'not-syncing',
      descriptorScope: onchainScope,
    })

    expect(isAnyRailSyncing()).toBe(false)
  })

  it('isAnyRailSyncing returns true when on-chain syncing', () => {
    applyOnchainSyncLifecycleSnapshotFromRemote({
      syncPhase: 'syncing',
      descriptorScope: onchainScope,
    })

    expect(isAnyRailSyncing()).toBe(true)
  })
})
