import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadePendingRecoveryDueToExpiredSignerBanner } from '@/components/wallet/ArkadePendingRecoveryDueToExpiredSignerBanner'

const balanceQueryMock = vi.fn()
const walletStoreState = vi.hoisted(() => ({
  arkadeBalance: null as { pendingRecoveryDueToExpiredSignerSats?: number } | null,
  networkMode: 'signet' as const,
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
}))

vi.mock('@/hooks/useMainnetFiatRatesQuery', () => ({
  useMainnetFiatRatesQuery: () => ({ isPending: false, data: undefined }),
}))

vi.mock('@/stores/fiatDenominationStore', () => ({
  useFiatDenominationStore: (selector: (state: { fiatDenominationMode: boolean; defaultFiatCurrency: string }) => unknown) =>
    selector({ fiatDenominationMode: false, defaultFiatCurrency: 'USD' }),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  return {
    ...actual,
    useWalletStore: (selector: (state: typeof walletStoreState) => unknown) =>
      selector(walletStoreState),
    selectCommittedNetworkMode: () => walletStoreState.networkMode,
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode
      to: string
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

describe('ArkadePendingRecoveryDueToExpiredSignerBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.arkadeBalance = null
    balanceQueryMock.mockReturnValue({ data: undefined })
  })

  it('DASH-ARK-19b shows banner when pendingRecoveryDueToExpiredSignerSats is greater than zero', () => {
    balanceQueryMock.mockReturnValue({
      data: { pendingRecoveryDueToExpiredSignerSats: 50_000 },
    })
    renderWithProviders(<ArkadePendingRecoveryDueToExpiredSignerBanner />)
    expect(
      screen.getByTestId('arkade-pending-recovery-due-to-expired-signer-banner'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pending recovery after signer rotation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /unilateral exit in Management/i })).toHaveAttribute(
      'href',
      '/wallet/management',
    )
  })

  it('is hidden when pendingRecoveryDueToExpiredSignerSats is zero', () => {
    balanceQueryMock.mockReturnValue({
      data: { pendingRecoveryDueToExpiredSignerSats: 0 },
    })
    const { container } = renderWithProviders(
      <ArkadePendingRecoveryDueToExpiredSignerBanner />,
    )
    expect(container.textContent).toBe('')
  })
})
