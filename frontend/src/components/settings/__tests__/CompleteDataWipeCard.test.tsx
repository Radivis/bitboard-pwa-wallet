import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

const ensureMigratedMock = vi.hoisted(() => vi.fn())
const getDatabaseMock = vi.hoisted(() => vi.fn())
const wipeAllAppDataOpfsAndReloadMock = vi.hoisted(() => vi.fn())
const anyWalletHasNoMnemonicBackupFlagMock = vi.hoisted(() => vi.fn())
const walletsState = vi.hoisted(() => ({ data: [] as Array<{ walletId: number; name: string }> }))

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (state: { walletStatus: string }) => unknown) =>
    selector({ walletStatus: 'unlocked' }),
}))

vi.mock('@/db', () => ({
  ensureMigrated: (...args: unknown[]) => ensureMigratedMock(...args),
  getDatabase: (...args: unknown[]) => getDatabaseMock(...args),
  useWallets: () => ({ data: walletsState.data }),
  isWalletDatabaseTeardownBlockedError: (error: unknown) =>
    error instanceof Error && error.message === 'Wallet database access blocked during teardown',
}))

vi.mock('@/db/wallet-no-mnemonic-backup', () => ({
  anyWalletHasNoMnemonicBackupFlag: (...args: unknown[]) =>
    anyWalletHasNoMnemonicBackupFlagMock(...args),
}))

vi.mock('@/db/opfs/wipe-all-app-data-opfs-and-reload', () => ({
  wipeAllAppDataOpfsAndReload: (...args: unknown[]) =>
    wipeAllAppDataOpfsAndReloadMock(...args),
}))

vi.mock('@/lib/esplora/mainnet-onchain-balance-probe', () => ({
  listWalletsWithPositiveMainnetOnChainBalance: vi.fn(),
}))

import { CompleteDataWipeCard } from '@/components/settings/CompleteDataWipeCard'

describe('CompleteDataWipeCard teardown-blocked retry', () => {
  beforeEach(() => {
    walletsState.data = []
    ensureMigratedMock.mockReset()
    getDatabaseMock.mockReset()
    wipeAllAppDataOpfsAndReloadMock.mockReset().mockResolvedValue(undefined)
    anyWalletHasNoMnemonicBackupFlagMock.mockReset().mockResolvedValue(false)
  })

  it('CompleteDataWipeCard proceeds to wipe when ensureMigrated is teardown-blocked', async () => {
    const user = userEvent.setup()
    ensureMigratedMock.mockRejectedValueOnce(
      new Error('Wallet database access blocked during teardown'),
    )

    renderWithProviders(<CompleteDataWipeCard />)

    await user.click(screen.getByRole('button', { name: 'Delete all app data' }))
    await user.click(screen.getByRole('checkbox', { name: /I understand this cannot be undone/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(wipeAllAppDataOpfsAndReloadMock).toHaveBeenCalledTimes(1)
    })
    expect(anyWalletHasNoMnemonicBackupFlagMock).not.toHaveBeenCalled()
  })
})
