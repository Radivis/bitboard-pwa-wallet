import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const ensureSegwit0DescriptorRow = vi.hoisted(() => vi.fn())
const exportChangeset = vi.hoisted(() => vi.fn())
const getOnchainLoadHydrationForPostUnlock = vi.hoisted(() => vi.fn())
const getOnchainLoadLifecycleSnapshot = vi.hoisted(() => vi.fn())
const loadedDescriptorWallet = vi.hoisted(() => ({
  current: {
    networkMode: 'signet' as const,
    addressType: 'segwit' as const,
    accountId: 0,
  },
}))

vi.mock('@/lib/wallet/ensure-segwit0-descriptor-row', () => ({
  ensureSegwit0DescriptorRow: (...args: unknown[]) =>
    ensureSegwit0DescriptorRow(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  getOnchainLoadHydrationForPostUnlock: () => getOnchainLoadHydrationForPostUnlock(),
  getOnchainLoadLifecycleSnapshot: () => getOnchainLoadLifecycleSnapshot(),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      exportChangeset: (...args: unknown[]) => exportChangeset(...args),
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      loadedDescriptorWallet: loadedDescriptorWallet.current,
    }),
  },
}))

import { resolveBumperHydrateForSessionOpen } from '@/lib/wallet/resolve-bumper-hydrate'

describe('CQ-02 resolveBumperHydrateForSessionOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadedDescriptorWallet.current = {
      networkMode: 'signet',
      addressType: AddressType.SegWit,
      accountId: 0,
    }
    getOnchainLoadLifecycleSnapshot.mockReturnValue({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
    })
    getOnchainLoadHydrationForPostUnlock.mockReturnValue({
      fullScanDone: true,
      usedEmptyChainFallback: false,
    })
    ensureSegwit0DescriptorRow.mockResolvedValue({
      network: 'signet',
      addressType: AddressType.SegWit,
      accountId: 0,
      externalDescriptor: 'wpkh(xprv)',
      internalDescriptor: 'wpkh(xprv-int)',
      changeSet: '{"local":{"row":true}}',
      fullScanDone: false,
    })
    exportChangeset.mockResolvedValue('{"local":{"live":true}}')
  })

  it('live-export uses row fullScanDone not stale hydration', async () => {
    const hydrate = await resolveBumperHydrateForSessionOpen({
      walletId: 1,
      networkMode: 'signet',
    })

    expect(exportChangeset).toHaveBeenCalled()
    expect(hydrate).toEqual({
      bumperChangesetJson: '{"local":{"live":true}}',
      bumperFullScanDone: false,
    })
  })
})
