import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const ensureSegwit0DescriptorRow = vi.hoisted(() => vi.fn())
const exportChangeset = vi.hoisted(() => vi.fn())
const loadedDescriptorWallet = vi.hoisted(() => ({
  current: {
    networkMode: 'signet' as const,
    addressType: 'segwit' as const,
    accountId: 0,
  } as {
    networkMode: 'signet'
    addressType: 'segwit' | 'taproot'
    accountId: number
  } | null,
}))

vi.mock('@/lib/wallet/ensure-segwit0-descriptor-row', () => ({
  ensureSegwit0DescriptorRow: (...args: unknown[]) =>
    ensureSegwit0DescriptorRow(...args),
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

  it('live-export does not import onchain-load snapshot', async () => {
    const hydrate = await resolveBumperHydrateForSessionOpen({
      walletId: 1,
      networkMode: 'signet',
    })

    expect(exportChangeset).toHaveBeenCalled()
    expect(hydrate.bumperChangesetJson).toBe('{"local":{"live":true}}')
  })

  it('network-switch live-export uses the target SegWit-0 row fullScanDone', async () => {
    loadedDescriptorWallet.current = {
      networkMode: 'testnet',
      addressType: AddressType.SegWit,
      accountId: 0,
    }
    ensureSegwit0DescriptorRow.mockResolvedValue({
      network: 'testnet',
      addressType: AddressType.SegWit,
      accountId: 0,
      externalDescriptor: 'wpkh(xprv-testnet)',
      internalDescriptor: 'wpkh(xprv-testnet-int)',
      changeSet: '{"local":{"testnet":true}}',
      fullScanDone: false,
    })

    const hydrate = await resolveBumperHydrateForSessionOpen({
      walletId: 1,
      networkMode: 'testnet',
    })

    expect(ensureSegwit0DescriptorRow).toHaveBeenCalledWith({
      walletId: 1,
      network: 'testnet',
    })
    expect(exportChangeset).toHaveBeenCalled()
    expect(hydrate).toEqual({
      bumperChangesetJson: '{"local":{"live":true}}',
      bumperFullScanDone: false,
    })
  })

  it('uses persisted row when the loaded triple is not SegWit-0', async () => {
    loadedDescriptorWallet.current = {
      networkMode: 'signet',
      addressType: AddressType.Taproot,
      accountId: 0,
    }

    const hydrate = await resolveBumperHydrateForSessionOpen({
      walletId: 1,
      networkMode: 'signet',
    })

    expect(exportChangeset).not.toHaveBeenCalled()
    expect(hydrate).toEqual({
      bumperChangesetJson: '{"local":{"row":true}}',
      bumperFullScanDone: false,
    })
  })
})
