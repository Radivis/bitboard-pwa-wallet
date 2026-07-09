import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_PASSWORD } from '@/test-utils/test-providers'
import { WalletRouteSecretsGate } from '@/components/WalletRouteSecretsGate'
import { useWalletStore, AddressType } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { resetLockLifecycleStateForTests } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const orchestrateManualUnlock = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Outlet: () => <div data-testid="unlocked-content">Dashboard content</div>,
  }
})

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateManualUnlock: (...args: unknown[]) => orchestrateManualUnlock(...args),
  }
})

vi.mock('@/db', () => ({
  useWallets: () => ({ data: [{ walletId: 1, name: 'Test Wallet', createdAt: '' }] }),
}))

function WalletDashboardGateHarness() {
  return <WalletRouteSecretsGate />
}

describe('WalletRouteSecretsGate unlock flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    useNearZeroSecurityStore.setState({ active: false })
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'locked',
    })
    orchestrateManualUnlock.mockImplementation(async () => {
      useWalletStore.setState({ walletStatus: 'unlocked' })
    })
  })

  it('dismisses unlock dialog after successful password unlock', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WalletDashboardGateHarness />)

    await expect(screen.getByRole('dialog', { name: 'Unlock Wallet' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Bitboard app password'), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => {
      expect(orchestrateManualUnlock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 1,
          password: TEST_PASSWORD,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Unlock Wallet' })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('unlocked-content')).toBeInTheDocument()
  })

  it('keeps unlock dialog open when manual unlock resolves without unlocking wallet', async () => {
    orchestrateManualUnlock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<WalletDashboardGateHarness />)

    await user.type(screen.getByLabelText('Bitboard app password'), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => {
      expect(orchestrateManualUnlock).toHaveBeenCalled()
    })

    expect(screen.getByRole('dialog', { name: 'Unlock Wallet' })).toBeInTheDocument()
    expect(useWalletStore.getState().walletStatus).toBe('locked')
  })
})
