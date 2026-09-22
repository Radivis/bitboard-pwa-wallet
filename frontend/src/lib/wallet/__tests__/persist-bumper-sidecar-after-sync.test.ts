import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistBumperSegwit0SidecarIfAllowed = vi.hoisted(() => vi.fn())
const exportOnchainWalletChangeset = vi.hoisted(() => vi.fn())
const onchainWalletFullScanDone = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/persist-bumper-segwit0-sidecar', () => ({
  persistBumperSegwit0SidecarIfAllowed: (...args: unknown[]) =>
    persistBumperSegwit0SidecarIfAllowed(...args),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    exportOnchainWalletChangeset: (...args: unknown[]) =>
      exportOnchainWalletChangeset(...args),
    onchainWalletFullScanDone: (...args: unknown[]) =>
      onchainWalletFullScanDone(...args),
  }),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      loadedDescriptorWallet: {
        addressType: 'taproot',
        accountId: 0,
      },
      addressType: 'taproot',
      accountId: 0,
    }),
  },
}))

import {
  persistBumperSidecarAfterWalletWideSyncIfNeeded,
  persistBumperSidecarBestEffort,
} from '@/lib/wallet/persist-bumper-sidecar-after-sync'

describe('persistBumperSidecarBestEffort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportOnchainWalletChangeset.mockResolvedValue('{"local":{}}')
    onchainWalletFullScanDone.mockResolvedValue(true)
    persistBumperSegwit0SidecarIfAllowed.mockResolvedValue(true)
  })

  it('swallows persist errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    exportOnchainWalletChangeset.mockRejectedValue(new Error('export failed'))

    await expect(
      persistBumperSidecarBestEffort(
        { walletId: 4, networkMode: 'signet' },
        'after proceed',
      ),
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      'Arkade sidecar SegWit-0 persist after proceed failed',
      expect.any(Error),
    )
    warn.mockRestore()
  })
})

describe('persistBumperSidecarAfterWalletWideSyncIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportOnchainWalletChangeset.mockResolvedValue('{"local":{}}')
    onchainWalletFullScanDone.mockResolvedValue(true)
    persistBumperSegwit0SidecarIfAllowed.mockResolvedValue(true)
  })

  it('skips persist when the bumper scan was not wallet-wide', async () => {
    await persistBumperSidecarAfterWalletWideSyncIfNeeded({
      walletId: 4,
      networkMode: 'signet',
      didWalletWideSync: false,
    })

    expect(exportOnchainWalletChangeset).not.toHaveBeenCalled()
    expect(persistBumperSegwit0SidecarIfAllowed).not.toHaveBeenCalled()
  })

  it('persists after a wallet-wide bumper scan', async () => {
    await persistBumperSidecarAfterWalletWideSyncIfNeeded({
      walletId: 4,
      networkMode: 'signet',
      didWalletWideSync: true,
    })

    expect(persistBumperSegwit0SidecarIfAllowed).toHaveBeenCalled()
  })
})
