import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { LightningDashboardBalance } from '@/components/wallet/LightningDashboardBalance'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { useFeatureStore } from '@/stores/featureStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      search,
      ...props
    }: {
      children: ReactNode
      to: string
      search?: { section?: string }
    } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={search?.section != null ? `${to}?section=${search.section}` : to} {...props}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningBalancesForDashboardQuery: () => ({
    data: {
      lightningBalanceRows: [
        { connectionId: 'nwc-alby', label: 'Alby', balanceSats: 1_000 },
      ],
      totalSats: 1_000,
    },
    isLoading: false,
    isSuccess: true,
  }),
}))

vi.mock('@/hooks/useLightningDashboardQueries', () => ({
  useLightningSyncMetadataQuery: () => ({ data: { lastSyncedAt: null } }),
}))

vi.mock('@/hooks/useLightningLifecycleSnapshots', () => ({
  useLightningRailSnapshot: () => ({ loadPhase: 'loaded', syncPhase: 'not-syncing' }),
  useLightningLoadLifecycleSnapshot: () => ({ loadPhase: 'loaded', errorMessage: null }),
  useLightningSyncLifecycleSnapshot: () => ({ syncPhase: 'not-syncing', errorMessage: null }),
}))

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useLightningManualSyncMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useMainnetFiatAmountProps', () => ({
  useMainnetFiatAmountProps: () => ({
    showFiatLayout: false,
    btcPriceInFiat: null,
    currency: 'USD',
    rateLoading: false,
  }),
}))

const connectedWallet: ConnectedLightningWallet = {
  id: 'nwc-alby',
  walletId: 7,
  label: 'Alby',
  networkMode: 'signet',
  config: { type: 'nwc', connectionString: 'nostr+walletconnect://example' },
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('LightningDashboardBalance', () => {
  afterEach(() => {
    useFeatureStore.setState({ isLightningEnabled: false })
    useLightningStore.setState({ connectedWallets: [], activeConnectionIds: {} })
    useWalletStore.setState({ activeWalletId: null })
  })

  it('links Advanced actions to the Lightning card in Management', () => {
    useFeatureStore.setState({ isLightningEnabled: true })
    useWalletStore.setState({ activeWalletId: connectedWallet.walletId, networkMode: 'signet' })
    useLightningStore.setState({ connectedWallets: [connectedWallet], activeConnectionIds: {} })

    renderWithProviders(<LightningDashboardBalance />)

    const advancedActions = screen.getByTestId('dashboard-lightning-advanced-actions')
    expect(advancedActions).toHaveTextContent('Advanced actions')
    expect(advancedActions).toHaveAttribute('data-type', 'tertiary')
    expect(advancedActions).toHaveClass('w-fit', 'self-start')
    expect(advancedActions).toHaveAttribute('href', '/wallet/management?section=lightning')
  })
})
