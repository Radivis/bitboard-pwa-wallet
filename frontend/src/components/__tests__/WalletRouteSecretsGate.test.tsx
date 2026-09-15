import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { WalletRouteSecretsGate } from '@/components/WalletRouteSecretsGate'
import { useWalletStore, AddressType } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { resetLockLifecycleStateForTests } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Outlet: () => <div data-testid="wallet-route-outlet">Wallet child route</div>,
  }
})

vi.mock('@/components/WalletUnlock', () => ({
  WalletUnlock: () => <div data-testid="wallet-unlock">Unlock</div>,
}))

vi.mock('@/lib/wallet/near-zero-wallet-hydration', () => ({
  hydrateNearZeroSessionForWalletRoute: vi.fn().mockResolvedValue(false),
}))

describe('WalletRouteSecretsGate', () => {
  beforeEach(() => {
    resetLockLifecycleStateForTests()
    useNearZeroSecurityStore.setState({ active: false })
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'unlocked',
    })
  })

  it('renders child routes when wallet is unlocked', () => {
    renderWithProviders(<WalletRouteSecretsGate />)
    expect(screen.getByTestId('wallet-route-outlet')).toBeInTheDocument()
    expect(screen.queryByTestId('wallet-unlock')).not.toBeInTheDocument()
  })

  it('shows unlock UI when wallet is locked', async () => {
    useWalletStore.setState({ walletStatus: 'locked' })
    renderWithProviders(<WalletRouteSecretsGate />)
    expect(await screen.findByTestId('wallet-unlock')).toBeInTheDocument()
    expect(screen.queryByTestId('wallet-route-outlet')).not.toBeInTheDocument()
  })

  it('allows child routes when no active wallet is selected', () => {
    useWalletStore.setState({ activeWalletId: null, walletStatus: 'none' })
    renderWithProviders(<WalletRouteSecretsGate />)
    expect(screen.getByTestId('wallet-route-outlet')).toBeInTheDocument()
    expect(screen.queryByTestId('wallet-unlock')).not.toBeInTheDocument()
  })
})
