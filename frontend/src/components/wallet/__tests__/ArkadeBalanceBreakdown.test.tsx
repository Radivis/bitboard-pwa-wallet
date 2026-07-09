import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ArkadeBalanceBreakdown } from '@/components/wallet/ArkadeBalanceBreakdown'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'

const fiatRatesQueryMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { btcPriceInFiat: number } | undefined,
    isPending: false,
  })),
)

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as 'signet' | 'mainnet',
  loadedDescriptorWallet: null as { networkMode: 'signet' | 'mainnet' } | null,
}))

vi.mock('@/hooks/useMainnetFiatRatesQuery', () => ({
  useMainnetFiatRatesQuery: () => fiatRatesQueryMock(),
}))

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const useWalletStoreMock = (selector: (s: typeof walletStoreState) => unknown) =>
    selector(walletStoreState)
  Object.assign(useWalletStoreMock, {
    getState: () => walletStoreState,
  })
  return {
    ...actual,
    useWalletStore: useWalletStoreMock,
    selectCommittedNetworkMode: actual.selectCommittedNetworkMode,
  }
})

describe('ArkadeBalanceBreakdown', () => {
  beforeEach(() => {
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = null
    useFiatDenominationStore.setState({ fiatDenominationMode: false })
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: false })
  })

  it('shows bumper wallet separately from headline balance', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 50_000,
          offchainSpendableSats: 0,
          onchainBumperSats: 50_000,
          totalSats: 50_000,
        }}
        amountTestId="arkade-balance-amount"
      />,
    )

    expect(screen.getByTestId('arkade-balance-amount')).toHaveTextContent('0.00000000')
    expect(screen.getByTestId('arkade-balance-bumper')).toHaveTextContent('Bumper wallet (exit fees)')
    expect(screen.queryByText('Total (incl. recoverable):')).not.toBeInTheDocument()
  })

  it('shows negative exit in progress lines without reducing headline spendable', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 200_000,
          offchainSpendableSats: 200_000,
          totalSats: 200_000,
          unilateralExitInProgressSats: 180_603,
          collaborativeExitInProgressSats: 50_000,
        }}
        amountTestId="arkade-balance-amount"
      />,
    )

    expect(screen.getByTestId('arkade-balance-amount')).toHaveTextContent('0.00200000')
    expect(screen.getByTestId('arkade-balance-unilateral-exit')).toHaveTextContent(
      /Unilateral exit in progress/,
    )
    expect(screen.getByTestId('arkade-balance-collaborative-exit')).toHaveTextContent(
      /Collaborative exit in progress/,
    )
  })

  it('shows pending operator sweep line when recoverable VTXOs await operator sweep', () => {
    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 10_000,
          totalSats: 35_000,
          recoverablePendingOperatorSweepSats: 25_000,
          recoverablePendingOperatorSweepVtxoCount: 2,
        }}
      />,
    )

    expect(screen.getByTestId('arkade-balance-recoverable-pending-operator-sweep')).toHaveTextContent(
      /Expired — waiting for operator sweep \(2 VTXOs\)/,
    )
  })

  it('renders fiat primary and muted BTC secondary on mainnet with fiat mode', () => {
    walletStoreState.networkMode = 'mainnet'
    useFiatDenominationStore.setState({ fiatDenominationMode: true })
    fiatRatesQueryMock.mockReturnValue({
      data: { btcPriceInFiat: 100_000 },
      isPending: false,
    })

    renderWithProviders(
      <ArkadeBalanceBreakdown
        balance={{
          confirmedSats: 100_000,
          totalSats: 100_000,
        }}
        amountTestId="arkade-balance-amount"
      />,
    )

    expect(screen.getByTestId('arkade-balance-amount')).toHaveTextContent(/\$100/)
    expect(screen.getByTestId('arkade-balance-amount-btc-segment')).toHaveTextContent(
      '0.00100000',
    )
  })
})
