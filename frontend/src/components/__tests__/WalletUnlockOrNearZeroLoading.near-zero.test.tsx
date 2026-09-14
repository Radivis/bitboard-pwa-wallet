import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { WalletRouteSecretsGate } from '@/components/WalletRouteSecretsGate'
import { useWalletStore, AddressType } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { resetLockLifecycleStateForTests, syncLockLifecycleWithActiveWallet } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'
import type { QueryClient } from '@tanstack/react-query'

const {
  hydrateNearZeroSessionForWalletRoute,
  orchestrateBootstrapUnlock,
  walletSecretsSessionState,
} = vi.hoisted(() => ({
  hydrateNearZeroSessionForWalletRoute: vi.fn(),
  orchestrateBootstrapUnlock: vi.fn(),
  walletSecretsSessionState: { active: false },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Outlet: () => <div data-testid="unlocked-content">Dashboard content</div>,
  }
})

vi.mock('@/lib/wallet/near-zero-wallet-hydration', () => ({
  hydrateNearZeroSessionForWalletRoute: (...args: unknown[]) =>
    hydrateNearZeroSessionForWalletRoute(...args),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: async () => walletSecretsSessionState.active,
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateBootstrapUnlock: (...args: unknown[]) => orchestrateBootstrapUnlock(...args),
  }
})

vi.mock('@/db', () => ({
  useWallets: () => ({ data: [{ walletId: 1, name: 'Test Wallet', createdAt: '' }] }),
  getDatabase: () => ({}),
}))

describe('WalletUnlockOrNearZeroLoading near-zero hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    syncLockLifecycleWithActiveWallet(1)
    walletSecretsSessionState.active = true
    useNearZeroSecurityStore.setState({ active: true })
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'locked',
    })
    hydrateNearZeroSessionForWalletRoute.mockImplementation(async (queryClient: QueryClient) => {
      walletSecretsSessionState.active = true
      await queryClient.invalidateQueries({
        queryKey: ['wallet_db', 'wallet-secrets-session-active-probe'],
      })
      return true
    })
    orchestrateBootstrapUnlock.mockImplementation(async () => {
      useWalletStore.setState({ walletStatus: 'unlocked' })
    })
  })

  it('leaves Unlocking wallet after near-zero hydrate and bootstrap', async () => {
    renderWithProviders(<WalletRouteSecretsGate />)

    expect(screen.getByText('Unlocking wallet…')).toBeInTheDocument()

    await waitFor(() => {
      expect(hydrateNearZeroSessionForWalletRoute).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByTestId('unlocked-content')).toBeInTheDocument()
    })
    expect(screen.queryByText('Unlocking wallet…')).not.toBeInTheDocument()
  })
})
