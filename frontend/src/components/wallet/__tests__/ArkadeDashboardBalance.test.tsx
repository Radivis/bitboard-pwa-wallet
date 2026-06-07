import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeDashboardBalance } from '@/components/wallet/ArkadeDashboardBalance'
import type { NetworkMode } from '@/stores/walletStore'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    {
      getState: () => ({ isArkadeEnabled: true, isMainnetAccessEnabled: false }),
    },
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

describe('ArkadeDashboardBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.networkMode = 'signet'
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
  })

  it('DASH-ARK-01 shows card when Arkade active on signet', () => {
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-card')).toBeInTheDocument()
    expect(screen.getByText('Arkade balance')).toBeInTheDocument()
  })

  it('DASH-ARK-02 hides card on lab network', () => {
    walletStoreState.networkMode = 'lab'
    const { container } = renderWithProviders(<ArkadeDashboardBalance />)
    expect(container).toBeEmptyDOMElement()
  })

  it('DASH-ARK-10 shows loading spinner', () => {
    balanceQueryMock.mockReturnValue({ isLoading: true, data: undefined })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('DASH-ARK-11 shows balance and pending total when they differ', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 40_000, totalSats: 45_000 },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
    expect(screen.getByText('Total (incl. pending):')).toBeInTheDocument()
  })

  it('DASH-ARK-12 shows empty session copy when no data', () => {
    balanceQueryMock.mockReturnValue({ isLoading: false, data: undefined })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.getByTestId('dashboard-arkade-session-empty')).toHaveTextContent(
      'No Arkade session yet',
    )
  })

  it('DASH-ARK-13 shows balance not empty copy when cached data exists during refetch', () => {
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      isFetching: true,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
    renderWithProviders(<ArkadeDashboardBalance />)
    expect(screen.queryByTestId('dashboard-arkade-session-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-arkade-balance-amount')).toBeInTheDocument()
  })
})
