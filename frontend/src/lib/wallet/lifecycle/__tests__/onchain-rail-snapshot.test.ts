import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/stores/walletStore'

const loadSnapshot = { loadPhase: 'loaded' as const, networkMode: 'testnet' as const }
const syncSnapshot = {
  syncPhase: 'not-syncing' as const,
  descriptorScope: {
    walletId: 1,
    networkMode: 'testnet' as const,
    addressType: AddressType.Taproot,
    accountId: 0,
  },
}
const saveSnapshot = {
  savePhase: 'not-saving' as const,
  errorMessage: null,
  descriptorScope: syncSnapshot.descriptorScope,
}

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  getOnchainLoadLifecycleSnapshot: () => loadSnapshot,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  getOnchainSyncLifecycleSnapshot: () => syncSnapshot,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator', () => ({
  getOnchainSaveLifecycleSnapshot: () => saveSnapshot,
}))

const walletStoreState = {
  activeWalletId: 1 as number | null,
  networkMode: 'testnet' as const,
  addressType: AddressType.Taproot,
  accountId: 0,
  loadedDescriptorWallet: {
    networkMode: 'testnet' as const,
    addressType: AddressType.Taproot,
    accountId: 0,
  },
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
  getLocalOnchainRailDescriptorScope,
  getOnchainRailSnapshot,
  localDescriptorScopeMatchesRemote,
} from '@/lib/wallet/lifecycle/onchain-rail-snapshot'

describe('onchain-rail-snapshot', () => {
  beforeEach(() => {
    loadSnapshot.loadPhase = 'loaded'
    loadSnapshot.networkMode = 'testnet'
    syncSnapshot.syncPhase = 'not-syncing'
    saveSnapshot.savePhase = 'not-saving'
    walletStoreState.activeWalletId = 1
  })

  it('getOnchainRailSnapshot reflects all three phases', () => {
    expect(getOnchainRailSnapshot()).toEqual({
      loadPhase: 'loaded',
      syncPhase: 'not-syncing',
      savePhase: 'not-saving',
    })
  })

  it('lab network keeps sync not-configured', () => {
    loadSnapshot.networkMode = 'lab'
    expect(getOnchainRailSnapshot()).toEqual({
      loadPhase: 'loaded',
      syncPhase: 'not-configured',
      savePhase: 'not-saving',
    })
  })

  it('localDescriptorScopeMatchesRemote when triple matches', () => {
    const scope = getLocalOnchainRailDescriptorScope()
    expect(scope).not.toBeNull()
    expect(localDescriptorScopeMatchesRemote(scope!)).toBe(true)
  })

  it('localDescriptorScopeMatchesRemote false when walletId differs', () => {
    const scope = getLocalOnchainRailDescriptorScope()
    expect(localDescriptorScopeMatchesRemote({ ...scope!, walletId: 99 })).toBe(false)
  })
})
