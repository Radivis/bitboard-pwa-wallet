import { beforeEach, describe, expect, it, vi } from 'vitest'

const persistBumperSegwit0SidecarIfAllowed = vi.hoisted(() => vi.fn())
const exportOnchainWalletChangeset = vi.hoisted(() => vi.fn())
const onchainWalletFullScanDone = vi.hoisted(() => vi.fn())
const hasOpenSession = vi.hoisted(() => vi.fn())
const walletStoreState = vi.hoisted(() => ({
  loadedDescriptorWallet: {
    addressType: 'taproot' as string,
    accountId: 0,
  },
  addressType: 'taproot',
  accountId: 0,
  activeArkadeAccountId: 'acct-1' as string | null,
}))

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
    hasOpenSession: (...args: unknown[]) => hasOpenSession(...args),
  }),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => walletStoreState,
  },
}))

import {
  persistBumperSidecarAfterWalletSync,
  persistBumperSidecarAfterWalletWideSyncIfNeeded,
  persistBumperSidecarBestEffort,
} from '@/lib/wallet/persist-bumper-sidecar-after-sync'

function resetPersistMocks() {
  vi.clearAllMocks()
  walletStoreState.activeArkadeAccountId = 'acct-1'
  walletStoreState.loadedDescriptorWallet = {
    addressType: 'taproot',
    accountId: 0,
  }
  hasOpenSession.mockResolvedValue(true)
  exportOnchainWalletChangeset.mockResolvedValue('{"local":{}}')
  onchainWalletFullScanDone.mockResolvedValue(true)
  persistBumperSegwit0SidecarIfAllowed.mockResolvedValue(true)
}

describe('persistBumperSidecarBestEffort', () => {
  beforeEach(resetPersistMocks)

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
  beforeEach(resetPersistMocks)

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

describe('SE-07 persistBumperSidecarAfterWalletSync session bind', () => {
  beforeEach(resetPersistMocks)

  it('persistBumperSidecarAfterWalletSync_skips_when_session_unbound', async () => {
    hasOpenSession.mockResolvedValue(false)

    const persisted = await persistBumperSidecarAfterWalletSync({
      walletId: 4,
      networkMode: 'signet',
    })

    expect(persisted).toBe(false)
    expect(hasOpenSession).toHaveBeenCalledWith({
      walletId: 4,
      networkMode: 'signet',
      arkadeAccountId: 'acct-1',
    })
    expect(exportOnchainWalletChangeset).not.toHaveBeenCalled()
    expect(persistBumperSegwit0SidecarIfAllowed).not.toHaveBeenCalled()
  })

  it('persistBumperSidecarAfterWalletSync_skips_when_account_missing', async () => {
    walletStoreState.activeArkadeAccountId = null

    const persisted = await persistBumperSidecarAfterWalletSync({
      walletId: 4,
      networkMode: 'signet',
    })

    expect(persisted).toBe(false)
    expect(hasOpenSession).not.toHaveBeenCalled()
    expect(exportOnchainWalletChangeset).not.toHaveBeenCalled()
    expect(persistBumperSegwit0SidecarIfAllowed).not.toHaveBeenCalled()
  })

  it('persistBumperSidecarAfterWalletSync_persists_when_session_matches', async () => {
    const persisted = await persistBumperSidecarAfterWalletSync({
      walletId: 4,
      networkMode: 'signet',
    })

    expect(persisted).toBe(true)
    expect(hasOpenSession).toHaveBeenCalledWith({
      walletId: 4,
      networkMode: 'signet',
      arkadeAccountId: 'acct-1',
    })
    expect(exportOnchainWalletChangeset).toHaveBeenCalled()
    expect(persistBumperSegwit0SidecarIfAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 4,
        network: 'signet',
        changesetJson: '{"local":{}}',
        markFullScanDone: true,
      }),
    )
  })
})
