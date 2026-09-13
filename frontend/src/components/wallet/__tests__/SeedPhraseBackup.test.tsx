import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_MNEMONIC_12 } from '@/test-utils/test-providers'
import { useWalletStore } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

const dbMocks = vi.hoisted(() => ({
  tryLoadNearZeroSessionIntoMemory: vi.fn(),
  loadWalletSecrets: vi.fn(),
  loadWalletSecretsWithPassword: vi.fn(),
}))

vi.mock('@/db', () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn().mockReturnValue({}),
  tryLoadNearZeroSessionIntoMemory: (...args: unknown[]) =>
    dbMocks.tryLoadNearZeroSessionIntoMemory(...args),
  useWalletNoMnemonicBackupFlag: () => ({ data: false }),
  clearWalletNoMnemonicBackupFlag: vi.fn(),
}))

vi.mock('@/db/wallet-persistence', () => ({
  loadWalletSecrets: (...args: unknown[]) => dbMocks.loadWalletSecrets(...args),
  loadWalletSecretsWithPassword: (...args: unknown[]) =>
    dbMocks.loadWalletSecretsWithPassword(...args),
}))

import { SeedPhraseBackup } from '@/components/wallet/SeedPhraseBackup'

describe('SeedPhraseBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNearZeroSecurityStore.setState({ active: false })
    useWalletStore.setState({ activeWalletId: 1 })
    dbMocks.tryLoadNearZeroSessionIntoMemory.mockResolvedValue(false)
    dbMocks.loadWalletSecrets.mockResolvedValue({ mnemonic: TEST_MNEMONIC_12 })
    dbMocks.loadWalletSecretsWithPassword.mockResolvedValue({ mnemonic: TEST_MNEMONIC_12 })
  })

  it('reveals the mnemonic without a password prompt when near-zero is configured in the database', async () => {
    dbMocks.tryLoadNearZeroSessionIntoMemory.mockResolvedValue(true)
    const user = userEvent.setup()
    renderWithProviders(<SeedPhraseBackup />)

    await user.click(screen.getByRole('button', { name: 'Show Seed Phrase' }))

    await waitFor(() => {
      expect(screen.getByText('Your Seed Phrase')).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('heading', { name: 'Enter Bitboard app password' }),
    ).not.toBeInTheDocument()
    expect(dbMocks.loadWalletSecrets).toHaveBeenCalledTimes(1)
    expect(dbMocks.loadWalletSecretsWithPassword).not.toHaveBeenCalled()
    expect(screen.getAllByText('abandon').length).toBeGreaterThan(0)
  })

  it('still prompts for a password when near-zero is not configured', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SeedPhraseBackup />)

    await user.click(screen.getByRole('button', { name: 'Show Seed Phrase' }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Enter Bitboard app password' }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Your Seed Phrase')).not.toBeInTheDocument()
    expect(dbMocks.loadWalletSecrets).not.toHaveBeenCalled()
  })
})
