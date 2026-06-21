import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
// Harness must load before settings pages (registers vi.mock for stores/workers).
import {
  toast,
  featureStoreState,
  mockCommitLoadedDescriptorWallet,
  mockExportChangeset,
  mockLoadWalletSecretsPayload,
  mockResolveDescriptorWallet,
  mockSetNetworkMode,
  mockSetThemeMode,
  mockUpdateDescriptorWalletChangeset,
  mockWalletsState,
  nearZeroSecurityState,
  resetSettingsPageTestState,
  walletStoreState,
} from '@/test-utils/settings-page-test-harness'
import { GITHUB_CHANGELOG_URL } from '@common/public-links'
import { SettingsMainPage } from '@/pages/settings/SettingsMainPage'
import { SettingsSecurityPage } from '@/pages/settings/SettingsSecurityPage'
import { SettingsFeaturesPage } from '@/pages/settings/SettingsFeaturesPage'
import { SettingsAboutPage } from '@/pages/settings/SettingsAboutPage'

describe('Settings routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    resetSettingsPageTestState()
  })

  describe('SettingsMainPage', () => {
    it('renders core main sections (Address Type hidden when SegWit feature is off)', () => {
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByText('Network')).toBeInTheDocument()
      expect(screen.queryByText('Address Type')).not.toBeInTheDocument()
      expect(screen.getByText('Appearance')).toBeInTheDocument()
      expect(screen.getByText('Currency / unit defaults')).toBeInTheDocument()
      expect(
        screen.getByText(/Available options depend on the selected rate service/i),
      ).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeInTheDocument()
      expect(screen.queryByText('Data Backups')).not.toBeInTheDocument()
    })

    it('shows Address Type card when SegWit addresses feature is enabled', () => {
      featureStoreState.isSegwitAddressesEnabled = true
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByText('Address Type')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Taproot (BIP86)' }),
      ).toBeInTheDocument()
    })

    it('hides Periodic sync card when periodic sync feature is disabled', () => {
      renderWithProviders(<SettingsMainPage />)
      expect(screen.queryByText('Periodic sync')).not.toBeInTheDocument()
    })

    it('shows Periodic sync card with on-chain row when feature is enabled', () => {
      featureStoreState.isPeriodicSyncEnabled = true
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByTestId('periodic-sync-row-onchain')).toBeInTheDocument()
      expect(screen.queryByTestId('periodic-sync-row-lightning')).not.toBeInTheDocument()
      expect(screen.queryByTestId('periodic-sync-row-arkade')).not.toBeInTheDocument()
    })

    it('shows Lightning and Arkade periodic sync rows when those features are enabled', () => {
      featureStoreState.isPeriodicSyncEnabled = true
      featureStoreState.isLightningEnabled = true
      featureStoreState.isArkadeEnabled = true
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByTestId('periodic-sync-row-onchain')).toBeInTheDocument()
      expect(screen.getByTestId('periodic-sync-row-lightning')).toBeInTheDocument()
      expect(screen.getByTestId('periodic-sync-row-arkade')).toBeInTheDocument()
    })

    it('network selector commits loaded descriptor wallet after switch completes', async () => {
      mockExportChangeset.mockResolvedValueOnce('{}')
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'Testnet' }))

      await waitFor(() => {
        expect(mockCommitLoadedDescriptorWallet).toHaveBeenCalledWith({
          networkMode: 'testnet',
          addressType: 'taproot',
          accountId: 0,
        })
      })
    })

    it('network selector prompts to unlock when wallet is locked and does not change network yet', async () => {
      walletStoreState.walletStatus = 'locked'
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'Testnet' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Unlock Wallet' })).toBeInTheDocument()
      expect(mockSetNetworkMode).not.toHaveBeenCalled()
    })

    it('network selector prompts to unlock when walletStatus is none after reload', async () => {
      walletStoreState.walletStatus = 'none'
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'Testnet' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(mockSetNetworkMode).not.toHaveBeenCalled()
    })

    it('address type selector shows confirmation when wallet exists', async () => {
      featureStoreState.isSegwitAddressesEnabled = true
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'SegWit (BIP84)' }))
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument()
      })
      expect(screen.getByText('Change Address Type?')).toBeInTheDocument()
    })

    it('theme selector calls setThemeMode', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: /Dark/ }))
      expect(mockSetThemeMode).toHaveBeenCalledWith('dark')
    })

    it('network switch when unlocked calls updateDescriptorWalletChangeset then resolveDescriptorWallet in order', async () => {
      mockExportChangeset.mockResolvedValueOnce('{"last_reveal":{"0":0}}')
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'Testnet' }))

      await waitFor(() => {
        expect(mockUpdateDescriptorWalletChangeset).toHaveBeenCalledWith({
          walletId: 1,
          network: 'signet',
          addressType: 'taproot',
          accountId: 0,
          changesetJson: '{"last_reveal":{"0":0}}',
        })
      })
      expect(mockResolveDescriptorWallet).toHaveBeenCalledWith({
        walletId: 1,
        targetNetwork: 'testnet',
        targetAddressType: 'taproot',
        targetAccountId: 0,
      })
      const updateCallOrder = mockUpdateDescriptorWalletChangeset.mock.invocationCallOrder[0]
      const resolveCallOrder = mockResolveDescriptorWallet.mock.invocationCallOrder[0]
      expect(updateCallOrder).toBeLessThan(resolveCallOrder)
    })

    it('hides Regtest network button when Regtest mode is disabled', () => {
      featureStoreState.isRegtestModeEnabled = false
      renderWithProviders(<SettingsMainPage />)
      expect(screen.queryByRole('button', { name: 'Regtest' })).not.toBeInTheDocument()
    })

    it('shows Regtest network button when Regtest mode is enabled', () => {
      featureStoreState.isRegtestModeEnabled = true
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByRole('button', { name: 'Regtest' })).toBeInTheDocument()
    })

    it('shows a toast when Mainnet is tapped while Mainnet access is off', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsMainPage />)

      await user.click(screen.getByRole('button', { name: 'Mainnet' }))

      expect(toast.info).toHaveBeenCalledWith(
        'Activate Mainnet access in Settings → Features before selecting Mainnet.',
      )
    })

    it('shows receiving descriptor when a wallet exists and session is unlocked', async () => {
      const user = userEvent.setup()
      mockWalletsState.data = [
        { walletId: 1, name: 'Test', createdAt: new Date().toISOString() },
      ]
      walletStoreState.walletStatus = 'unlocked'
      renderWithProviders(<SettingsMainPage />)
      expect(screen.getByText('Receiving descriptor')).toBeInTheDocument()
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Show receiving descriptor' }),
        ).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: 'Show receiving descriptor' }))
      expect(screen.getByText('tr([mock]/0/*)')).toBeInTheDocument()
      expect(mockLoadWalletSecretsPayload).toHaveBeenCalled()
    })

    it('shows unlock hint for receiving descriptor when wallet is locked', () => {
      mockWalletsState.data = [
        { walletId: 1, name: 'Test', createdAt: new Date().toISOString() },
      ]
      walletStoreState.walletStatus = 'locked'
      renderWithProviders(<SettingsMainPage />)
      expect(
        screen.getByText('Unlock your wallet to view the receiving descriptor.'),
      ).toBeInTheDocument()
    })
  })

  describe('SettingsSecurityPage', () => {
    it('disables wallet backup export/import in near-zero security mode with hint', () => {
      nearZeroSecurityState.active = true
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Export wallet data' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Import wallet backup' })).toBeDisabled()
      expect(
        screen.getByText(/Wallet export and import are not available in near-zero security mode/i),
      ).toBeInTheDocument()
    })

    it('disables Change app password when there are no wallets', () => {
      mockWalletsState.data = []
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Change app password' })).toBeDisabled()
    })

    it('enables Change app password when at least one wallet exists', () => {
      mockWalletsState.data = [
        { walletId: 1, name: 'Test', createdAt: new Date().toISOString() },
      ]
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Change app password' })).toBeEnabled()
    })

    it('mentions lab data scope in Data Backups card', () => {
      renderWithProviders(<SettingsSecurityPage />)
      expect(
        screen.getByText(/Lab data is tied to wallets on this device/i),
      ).toBeInTheDocument()
    })

    it('shows Set a real password when near-zero security mode is active', () => {
      nearZeroSecurityState.active = true
      mockWalletsState.data = []
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Set a real password' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Change app password' })).not.toBeInTheDocument()
      expect(screen.getByTestId('settings-security-card')).toHaveClass('border-destructive')
    })

    it('does not highlight security card when near-zero security mode is inactive', () => {
      nearZeroSecurityState.active = false
      mockWalletsState.data = []
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByTestId('settings-security-card')).not.toHaveClass('border-destructive')
    })

    it('shows complete data wipe card with destructive border', () => {
      renderWithProviders(<SettingsSecurityPage />)
      const card = screen.getByTestId('complete-data-wipe-card')
      expect(card).toHaveClass('border-destructive')
    })

    it('keeps Delete all app data enabled in near-zero mode when there are no wallets', () => {
      nearZeroSecurityState.active = true
      mockWalletsState.data = []
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Export wallet data' })).toBeDisabled()
    })

    it('disables Delete all app data when wallets exist but the wallet is locked', () => {
      mockWalletsState.data = [
        { walletId: 1, name: 'Test', createdAt: new Date().toISOString() },
      ]
      walletStoreState.walletStatus = 'locked'
      renderWithProviders(<SettingsSecurityPage />)
      expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeDisabled()
    })
  })

  describe('SettingsFeaturesPage', () => {
    it('opens Mainnet access confirmation modal when enabling the toggle', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsFeaturesPage />)

      await user.click(screen.getByRole('switch', { name: 'Enable Mainnet access' }))

      expect(
        screen.getByRole('heading', { name: 'Mainnet access', level: 2 }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Activate access' }),
      ).toBeDisabled()
    })

    it('enables Activate access after acknowledging risks', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsFeaturesPage />)

      await user.click(screen.getByRole('switch', { name: 'Enable Mainnet access' }))
      await user.click(
        screen.getByRole('checkbox', {
          name: /I understand the risks and have a seed phrase backup ready/,
        }),
      )

      const activate = screen.getByRole('button', { name: 'Activate access' })
      await expect(activate).toBeEnabled()
      await user.click(activate)

      expect(featureStoreState.setIsMainnetAccessEnabled).toHaveBeenCalledWith(true)
    })

    it('opens Arkade confirmation modal when enabling the toggle', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsFeaturesPage />)

      await user.click(screen.getByRole('switch', { name: 'Enable Arkade offchain layer' }))

      expect(
        screen.getByRole('heading', { name: 'Enable Arkade', level: 2 }),
      ).toBeInTheDocument()
      expect(screen.getByText(/Arkade support is brand new/i)).toBeInTheDocument()
      expect(screen.getByText(/Signet is strongly advised/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Enable Arkade' })).toBeDisabled()
      expect(featureStoreState.setIsArkadeEnabled).not.toHaveBeenCalled()
    })

    it('enables periodic sync when the feature toggle is switched on', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsFeaturesPage />)

      await user.click(screen.getByRole('switch', { name: 'Enable periodic sync' }))

      expect(featureStoreState.setIsPeriodicSyncEnabled).toHaveBeenCalledWith(true)
    })

    it('enables Arkade after acknowledging the new-feature warning', async () => {
      const user = userEvent.setup()
      renderWithProviders(<SettingsFeaturesPage />)

      await user.click(screen.getByRole('switch', { name: 'Enable Arkade offchain layer' }))
      await user.click(
        screen.getByRole('checkbox', {
          name: /I understand Arkade is new/i,
        }),
      )

      const enableArkade = screen.getByRole('button', { name: 'Enable Arkade' })
      await expect(enableArkade).toBeEnabled()
      await user.click(enableArkade)

      expect(featureStoreState.setIsArkadeEnabled).toHaveBeenCalledWith(true)
    })
  })

  describe('SettingsAboutPage', () => {
    it('shows About, legal hub, and privacy policy link', () => {
      renderWithProviders(<SettingsAboutPage />)
      expect(screen.getByRole('heading', { name: 'About', level: 2 })).toBeInTheDocument()
      expect(document.getElementById('legal-notice')).toBeTruthy()
      const privacyPolicyLink = screen.getByRole('link', { name: /privacy policy/i })
      expect(privacyPolicyLink).toHaveAttribute('href', '/privacy')
      const changelogLink = screen.getByRole('link', { name: 'Changelog' })
      expect(changelogLink).toHaveAttribute('href', GITHUB_CHANGELOG_URL)
    })

    it('shows Developer Contact Info card', () => {
      renderWithProviders(<SettingsAboutPage />)
      const devContactHeading = screen.getByText('Developer Contact Info')
      expect(devContactHeading).toBeInTheDocument()
      const devContactCard = devContactHeading.closest('[data-slot="card"]')
      expect(devContactCard).toBeTruthy()
      expect(within(devContactCard as HTMLElement).getByText('Michael Hrenka')).toBeInTheDocument()
      expect(
        within(devContactCard as HTMLElement).getByRole('link', {
          name: 'michael.hrenka@protonmail.com',
        }),
      ).toBeInTheDocument()
    })
  })
})
