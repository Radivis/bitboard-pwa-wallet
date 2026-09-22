import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

const mockUpdateDescriptorWalletChangeset = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/descriptor-wallet-manager', () => ({
  updateDescriptorWalletChangeset: (...args: unknown[]) =>
    mockUpdateDescriptorWalletChangeset(...args),
}))

import { persistBumperSegwit0SidecarIfAllowed } from '@/lib/wallet/persist-bumper-segwit0-sidecar'

describe('LIFE-ARK-BUMP-03 persistBumperSegwit0SidecarIfAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateDescriptorWalletChangeset.mockResolvedValue(undefined)
  })

  it('does not persist when SegWit-0 is the crypto slot', async () => {
    const persisted = await persistBumperSegwit0SidecarIfAllowed({
      walletId: 3,
      network: 'signet',
      changesetJson: '{"local":{}}',
      markFullScanDone: true,
      loadedAddressType: AddressType.SegWit,
      loadedAccountId: 0,
    })

    expect(persisted).toBe(false)
    expect(mockUpdateDescriptorWalletChangeset).not.toHaveBeenCalled()
  })

  it('persists SegWit-0 when Taproot is loaded', async () => {
    const persisted = await persistBumperSegwit0SidecarIfAllowed({
      walletId: 3,
      network: 'signet',
      changesetJson: '{"local":{"sidecar":true}}',
      markFullScanDone: true,
      lastSuccessfulEsploraSyncAt: '2026-01-01T00:00:00.000Z',
      loadedAddressType: AddressType.Taproot,
      loadedAccountId: 0,
    })

    expect(persisted).toBe(true)
    expect(mockUpdateDescriptorWalletChangeset).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 3,
        network: 'signet',
        addressType: AddressType.SegWit,
        accountId: 0,
        changesetJson: '{"local":{"sidecar":true}}',
        markFullScanDone: true,
        lastSuccessfulEsploraSyncAt: '2026-01-01T00:00:00.000Z',
      }),
    )
  })
})
