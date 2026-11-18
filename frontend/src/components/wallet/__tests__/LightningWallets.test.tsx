import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LightningWallets } from '@/components/wallet/LightningWallets'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@/hooks/useLightningMutations', () => ({
  useLnWalletBalanceQuery: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    data: { balanceSats: 1_000, isStaleBalance: false, balanceSnapshotAt: null },
  }),
  useLnWalletNetworkPlausibilityQuery: () => ({
    isSuccess: false,
    isPending: false,
    data: undefined,
  }),
  useTestConnectionMutation: () => ({ isPending: false, mutate: vi.fn() }),
}))

const CONNECTION_ID = 'nwc-alby'
const connectedWallet: ConnectedLightningWallet = {
  id: CONNECTION_ID,
  walletId: 7,
  label: 'Alby',
  networkMode: 'mainnet',
  config: { type: 'nwc', connectionString: 'nostr+walletconnect://example' },
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('LightningWallets remove confirmation', () => {
  const originalRemoveConnection = useLightningStore.getState().removeConnection
  const removeConnection = vi.fn().mockResolvedValue(undefined)

  afterEach(() => {
    useLightningStore.setState({
      connectedWallets: [],
      activeConnectionIds: {},
      removeConnection: originalRemoveConnection,
    })
    useWalletStore.setState({ activeWalletId: null })
  })

  function renderConnectedWallet() {
    useWalletStore.setState({ activeWalletId: connectedWallet.walletId })
    useLightningStore.setState({
      connectedWallets: [connectedWallet],
      activeConnectionIds: {},
      removeConnection,
    })
    renderWithProviders(<LightningWallets />)
  }

  it('waits for confirmation before removing an NWC wallet', async () => {
    const user = userEvent.setup()
    renderConnectedWallet()

    await user.click(screen.getByRole('button', { name: 'Remove Alby' }))

    expect(screen.getByRole('heading', { name: 'Remove Alby?' })).toBeInTheDocument()
    expect(screen.getByText(/Funds stay in that Lightning wallet/)).toBeInTheDocument()
    expect(removeConnection).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { name: 'Remove Alby?' })).not.toBeInTheDocument()
    expect(removeConnection).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove Alby' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(removeConnection).toHaveBeenCalledTimes(1)
    expect(removeConnection).toHaveBeenCalledWith(CONNECTION_ID)
  })
})
