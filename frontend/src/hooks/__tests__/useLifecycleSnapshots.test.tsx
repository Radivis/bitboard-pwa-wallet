import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  applyOnchainLoadLifecycleSnapshotFromOtherTab,
  resetOnchainLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import {
  applyOnchainSyncLifecycleSnapshotFromRemote,
  resetOnchainSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { resetOnchainSaveLifecycleStateForTests } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import {
  applyArkadeLoadLifecycleSnapshotFromOtherTab,
  resetArkadeLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import {
  resetArkadeSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { resetArkadeSaveLifecycleStateForTests } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import {
  resetLightningSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import {
  useOnchainLoadLifecycleSnapshot,
  useOnchainRailSnapshot,
} from '@/hooks/useOnchainLifecycleSnapshots'
import { useIsArkadeSessionReady } from '@/hooks/useArkadeLifecycleSnapshots'
import { useAnyRailSyncing } from '@/hooks/useWalletRailSyncAggregate'
import { AddressType } from '@/stores/walletStore'

const onchainScope = {
  walletId: 1,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
}

describe('lifecycle snapshot hooks', () => {
  beforeEach(() => {
    resetOnchainLoadLifecycleStateForTests()
    resetOnchainSyncLifecycleStateForTests()
    resetOnchainSaveLifecycleStateForTests()
    resetArkadeLoadLifecycleStateForTests()
    resetArkadeSyncLifecycleStateForTests()
    resetArkadeSaveLifecycleStateForTests()
    resetLightningSyncLifecycleStateForTests()
  })

  it('useOnchainLoadLifecycleSnapshot updates after apply snapshot', () => {
    const { result } = renderHook(() => useOnchainLoadLifecycleSnapshot())

    expect(result.current.loadPhase).toBe('not-configured')

    act(() => {
      applyOnchainLoadLifecycleSnapshotFromOtherTab({
        loadPhase: 'loaded',
        networkMode: 'testnet',
      })
    })

    expect(result.current.loadPhase).toBe('loaded')
    expect(result.current.networkMode).toBe('testnet')
  })

  it('useOnchainRailSnapshot collapses not-configured when load not-configured', () => {
    const { result } = renderHook(() => useOnchainRailSnapshot())

    expect(result.current).toEqual({
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    })
  })

  it('useIsArkadeSessionReady true only when loadPhase loaded', () => {
    const { result } = renderHook(() => useIsArkadeSessionReady())

    expect(result.current).toBe(false)

    act(() => {
      applyArkadeLoadLifecycleSnapshotFromOtherTab({
        loadPhase: 'loaded',
        networkMode: 'testnet',
      })
    })

    expect(result.current).toBe(true)
  })

  it('useAnyRailSyncing true when any rail syncing', () => {
    const { result } = renderHook(() => useAnyRailSyncing())

    expect(result.current).toBe(false)

    act(() => {
      applyOnchainSyncLifecycleSnapshotFromRemote({
        syncPhase: 'syncing',
        descriptorScope: onchainScope,
      })
    })

    expect(result.current).toBe(true)

    act(() => {
      applyOnchainSyncLifecycleSnapshotFromRemote({
        syncPhase: 'not-syncing',
        descriptorScope: onchainScope,
      })
    })

    expect(result.current).toBe(false)
  })
})
