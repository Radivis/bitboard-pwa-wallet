import { describe, expect, it, vi } from 'vitest'
import {
  runBackgroundBumperWalletSync,
  scheduleBackgroundBumperWalletSync,
} from '@/lib/arkade/background-bumper-wallet-sync'

describe('background bumper wallet sync', () => {
  it('scans then persists the sidecar', async () => {
    const syncBumperWallet = vi.fn(async () => {})
    const persistSidecar = vi.fn(async () => {})

    await runBackgroundBumperWalletSync({
      walletId: 3,
      networkMode: 'signet',
      syncBumperWallet,
      persistSidecar,
    })

    expect(syncBumperWallet).toHaveBeenCalledTimes(1)
    expect(persistSidecar).toHaveBeenCalledWith({
      walletId: 3,
      networkMode: 'signet',
    })
  })

  it('does not start a second scan while one is in flight', async () => {
    let releaseScan: () => void = () => {}
    const syncBumperWallet = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseScan = resolve
        }),
    )
    const persistSidecar = vi.fn(async () => {})

    scheduleBackgroundBumperWalletSync({
      walletId: 3,
      networkMode: 'signet',
      syncBumperWallet,
      persistSidecar,
    })
    scheduleBackgroundBumperWalletSync({
      walletId: 3,
      networkMode: 'signet',
      syncBumperWallet,
      persistSidecar,
    })

    expect(syncBumperWallet).toHaveBeenCalledTimes(1)
    releaseScan()
    await vi.waitFor(() => {
      expect(persistSidecar).toHaveBeenCalledTimes(1)
    })
  })
})