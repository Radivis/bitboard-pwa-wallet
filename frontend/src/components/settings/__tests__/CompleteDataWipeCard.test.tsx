import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'

const ensureMigratedMock = vi.hoisted(() => vi.fn())
const getDatabaseMock = vi.hoisted(() => vi.fn())
const wipeAllAppDataOpfsAndReloadMock = vi.hoisted(() => vi.fn())
const anyWalletHasNoMnemonicBackupFlagMock = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const walletsState = vi.hoisted(() => ({ data: [] as Array<{ walletId: number; name: string }> }))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}))

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (state: { walletStatus: string }) => unknown) =>
    selector({ walletStatus: 'unlocked' }),
}))

vi.mock('@/db', async () => {
  const { isWalletDatabaseTeardownBlockedError } = await import(
    '@/db/database-teardown-blocked-error'
  )
  return {
    ensureMigrated: (...args: unknown[]) => ensureMigratedMock(...args),
    getDatabase: (...args: unknown[]) => getDatabaseMock(...args),
    useWallets: () => ({ data: walletsState.data }),
    isWalletDatabaseTeardownBlockedError,
  }
})

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
import { WalletDatabaseTeardownBlockedError } from '@/db/database-teardown-blocked-error'

const completeDataWipeCardSourceByPath = import.meta.glob('../CompleteDataWipeCard.tsx', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

describe('CompleteDataWipeCard teardown-blocked retry', () => {
  beforeEach(() => {
    walletsState.data = []
    ensureMigratedMock.mockReset()
    getDatabaseMock.mockReset()
    wipeAllAppDataOpfsAndReloadMock.mockReset().mockResolvedValue(undefined)
    anyWalletHasNoMnemonicBackupFlagMock.mockReset().mockResolvedValue(false)
    toastError.mockReset()
  })

  it('CompleteDataWipeCard proceeds to wipe when ensureMigrated is teardown-blocked', async () => {
    const user = userEvent.setup()
    ensureMigratedMock.mockRejectedValueOnce(new WalletDatabaseTeardownBlockedError())

    renderWithProviders(<CompleteDataWipeCard />)

    await user.click(screen.getByRole('button', { name: 'Delete all app data' }))
    await user.click(screen.getByRole('checkbox', { name: /I understand this cannot be undone/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(wipeAllAppDataOpfsAndReloadMock).toHaveBeenCalledTimes(1)
    })
    expect(anyWalletHasNoMnemonicBackupFlagMock).not.toHaveBeenCalled()
  })

  it('toasts and does not wipe when ensureMigrated fails for another reason', async () => {
    const user = userEvent.setup()
    ensureMigratedMock.mockRejectedValueOnce(new Error('disk full'))

    renderWithProviders(<CompleteDataWipeCard />)

    await user.click(screen.getByRole('button', { name: 'Delete all app data' }))
    await user.click(screen.getByRole('checkbox', { name: /I understand this cannot be undone/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('disk full')
    })
    expect(wipeAllAppDataOpfsAndReloadMock).not.toHaveBeenCalled()
  })

  it('names teardown-blocked skip and shared wipe helper', () => {
    const completeDataWipeCardSource = Object.values(completeDataWipeCardSourceByPath)[0]
    expect(completeDataWipeCardSource).toContain('runFactoryResetWipeFromCard')
    expect(completeDataWipeCardSource).toContain('skipBackupCheckBecauseTeardownBlocked')
  })
})
