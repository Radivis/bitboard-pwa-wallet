import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { BarkDashboardBalance } from '@/components/wallet/BarkDashboardBalance'
import type { NetworkMode } from '@/stores/walletStore'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const loadSnapshot = vi.hoisted(() => ({
  current: {
    loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error' | 'not-configured',
    networkMode: 'signet' as NetworkMode | null,
    errorMessage: null as string | null,
    receiveKeyIndex: 0 as number | null,
  },
}))

const syncSnapshot = vi.hoisted(() => ({
  current: {
    syncPhase: 'not-syncing' as 'not-syncing' | 'syncing' | 'sync-error' | 'not-configured',
    networkMode: 'signet' as NetworkMode | null,
    errorMessage: null as string | null,
    spendableSats: null as number | null,
    lastSuccessfulSyncAt: null as string | null,
  },
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: typeof featureState) => unknown) => selector(featureState),
    { getState: () => featureState },
  ),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
}))

vi.mock('@/hooks/useBarkSyncLifecycleSnapshot', () => ({
  useBarkSyncLifecycleSnapshot: () => syncSnapshot.current,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useBarkManualSyncMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

describe('BarkDashboardBalance', () => {
  beforeEach(() => {
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    loadSnapshot.current = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
    syncSnapshot.current = {
      syncPhase: 'not-syncing',
      networkMode: 'signet',
      errorMessage: null,
      spendableSats: null,
      lastSuccessfulSyncAt: null,
    }
  })

  it('DASH-BARK-01 shows the card when Bark is active on signet', () => {
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.getByTestId('dashboard-bark-balance-card')).toBeInTheDocument()
    expect(screen.getByText('Bark balance')).toBeInTheDocument()
  })

  it('BARK-BOARD-01 links to Board from on-chain when Bark is enabled on signet', () => {
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.getByTestId('dashboard-bark-board-link')).toHaveAttribute(
      'href',
      '/wallet/bark/board',
    )
  })

  it('DASH-BARK-02 hides the card when Bark is disabled or the network is not signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkDashboardBalance />)
    expect(disabled.container).toBeEmptyDOMElement()
    expect(disabled.queryByTestId('dashboard-bark-board-link')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'testnet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'testnet' }
    const otherNetwork = renderWithProviders(<BarkDashboardBalance />)
    expect(otherNetwork.container).toBeEmptyDOMElement()
    expect(otherNetwork.queryByTestId('dashboard-bark-board-link')).not.toBeInTheDocument()
  })

  it('BARK-BOARD-02 omits the board link when Bark is disabled or the network is not signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkDashboardBalance />)
    expect(disabled.queryByRole('link', { name: 'Board from on-chain' })).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    const mutinynet = renderWithProviders(<BarkDashboardBalance />)
    expect(mutinynet.queryByRole('link', { name: 'Board from on-chain' })).not.toBeInTheDocument()
  })

  it('DASH-BARK-03 shows spendable sats after a successful sync', () => {
    syncSnapshot.current.spendableSats = 50_000
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.getByTestId('dashboard-bark-balance-amount')).toHaveTextContent('0.00050000')
  })

  it('DASH-BARK-04 does not render on-chain or Arkade balance amounts', () => {
    syncSnapshot.current.spendableSats = 50_000
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.queryByTestId('dashboard-onchain-balance-amount')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-arkade-balance-amount')).not.toBeInTheDocument()
  })

  it('DASH-BARK-05 keeps the previous amount and shows the sync error banner', () => {
    syncSnapshot.current = {
      syncPhase: 'sync-error',
      networkMode: 'signet',
      errorMessage: 'Bark server unreachable',
      spendableSats: 50_000,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
    }
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.getByTestId('wallet-sync-error-banner-bark')).toBeInTheDocument()
    expect(screen.getByText('Bark sync failed')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-bark-balance-amount')).toHaveTextContent('0.00050000')
  })

  it('DASH-BARK-06 shows the banner and no amount when nothing has synced yet', () => {
    syncSnapshot.current = {
      syncPhase: 'sync-error',
      networkMode: 'signet',
      errorMessage: 'Bark server unreachable',
      spendableSats: null,
      lastSuccessfulSyncAt: null,
    }
    renderWithProviders(<BarkDashboardBalance />)
    expect(screen.getByTestId('wallet-sync-error-banner-bark')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-bark-balance-amount')).not.toBeInTheDocument()
  })
})
