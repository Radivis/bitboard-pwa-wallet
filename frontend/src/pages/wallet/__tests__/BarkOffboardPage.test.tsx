import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BarkOffboardPage } from '@/pages/wallet/BarkOffboardPage'
import { BarkOffboardParkedError } from '@/lib/bark/perform-bark-offboard'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import type { NetworkMode } from '@/stores/walletStore'
import type { BarkPendingAction } from '@/workers/bark-api'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  currentAddress: 'tb1qcurrent' as string | null,
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
  current: { spendableSats: 50_000 as number | null },
}))

const pendingActions = vi.hoisted(() => ({
  current: [] as BarkPendingAction[],
}))

const reviewBarkOffboardAmount = vi.hoisted(() => vi.fn())
const reviewBarkOffboardAll = vi.hoisted(() => vi.fn())
const performBarkOffboard = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const getNewAddress = vi.hoisted(() => vi.fn())
const broadcastTransaction = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useNavigate: () => navigate,
  }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const fiatRatesQueryMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as { btcPriceInFiat: number } | undefined,
    isPending: false,
  })),
)

vi.mock('@/hooks/useMainnetFiatRatesQuery', () => ({
  useMainnetFiatRatesQuery: () => fiatRatesQueryMock(),
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (state: typeof featureState) => unknown) => selector(featureState),
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

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: Object.assign(
    (selector: (state: { getNewAddress: typeof getNewAddress; broadcastTransaction: typeof broadcastTransaction }) => unknown) =>
      selector({ getNewAddress, broadcastTransaction }),
    { getState: () => ({ getNewAddress, broadcastTransaction }) },
  ),
}))

vi.mock('@/hooks/useBarkSyncLifecycleSnapshot', () => ({
  useBarkSyncLifecycleSnapshot: () => syncSnapshot.current,
}))

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
}))

vi.mock('@/hooks/useBarkPendingActionsQuery', () => ({
  useBarkPendingActionsQuery: () => ({ data: pendingActions.current }),
}))

vi.mock('@/lib/bark/review-bark-offboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bark/review-bark-offboard')>()
  return { ...actual, reviewBarkOffboardAmount, reviewBarkOffboardAll }
})

vi.mock('@/lib/bark/perform-bark-offboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bark/perform-bark-offboard')>()
  return { ...actual, performBarkOffboard }
})

vi.mock('@/lib/bark/bark-offboard-live-deps', () => ({
  barkOffboardReviewDeps: () => ({
    estimateSendOnchain: vi.fn(),
    estimateOffboardAll: vi.fn(),
  }),
  barkOffboardPerformDeps: () => ({
    sendOnchain: vi.fn(),
    offboardAll: vi.fn(),
    syncBark: vi.fn(),
    startOnchainBackgroundSync: vi.fn(),
  }),
}))

const amountReview = {
  mode: 'amount' as const,
  destinationAddress: 'tb1qcurrent',
  amountSats: 10_000,
  feeSats: 250,
  onchainAmountSats: 10_000,
  grossAmountSats: 10_250,
}

describe('BarkOffboardPage', () => {
  beforeEach(() => {
    pendingActions.current = []
    useFiatDenominationStore.setState({ fiatDenominationMode: false, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: false })
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.currentAddress = 'tb1qcurrent'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    loadSnapshot.current = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
    syncSnapshot.current = { spendableSats: 50_000 }
    reviewBarkOffboardAmount.mockReset()
    reviewBarkOffboardAll.mockReset()
    performBarkOffboard.mockReset()
    navigate.mockReset()
    getNewAddress.mockReset()
    broadcastTransaction.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('BARK-EXIT-03 is not a form unless Bark is enabled on signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkOffboardPage />)
    expect(screen.getByText(/available on Signet and Mainnet when Bark is enabled/)).toBeInTheDocument()
    expect(screen.queryByTestId('bark-offboard-amount')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.queryByTestId('bark-offboard-amount')).not.toBeInTheDocument()
  })

  it('BARK-EXIT-04 shows the server fee and the on-chain amount before confirm', async () => {
    reviewBarkOffboardAmount.mockResolvedValue(amountReview)
    renderWithProviders(<BarkOffboardPage />)
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))

    expect(reviewBarkOffboardAmount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destinationAddress: 'tb1qcurrent',
        amountSats: 10_000,
      }),
    )
    expect(await screen.findByTestId('bark-offboard-fee')).toHaveTextContent('250')
    expect(screen.getByTestId('bark-offboard-onchain-amount')).toHaveTextContent('10000')
    expect(screen.getByTestId('bark-offboard-destination')).toHaveTextContent('tb1qcurrent')
    expect(screen.queryByTestId('bark-offboard-confirm')).toBeInTheDocument()
  })

  it('confirm uses the current address and does not reveal a new one', async () => {
    reviewBarkOffboardAmount.mockResolvedValue(amountReview)
    performBarkOffboard.mockResolvedValue({ txid: 'cc', syncWarning: null })
    renderWithProviders(<BarkOffboardPage />)
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-offboard-confirm'))

    await waitFor(() => {
      expect(performBarkOffboard).toHaveBeenCalledWith(expect.anything(), amountReview)
    })
    expect(getNewAddress).not.toHaveBeenCalled()
    expect(broadcastTransaction).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('disables exit entire balance when spendable sats are zero', () => {
    syncSnapshot.current = { spendableSats: 0 }
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.getByTestId('bark-offboard-review-all')).toBeDisabled()
  })

  it('BARK-EXIT-07 does not toast success when the exit throws', async () => {
    reviewBarkOffboardAmount.mockResolvedValue(amountReview)
    performBarkOffboard.mockRejectedValue(new Error('insufficient funds'))
    renderWithProviders(<BarkOffboardPage />)
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-offboard-confirm'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('BARK-EXIT-08 keeps a parked exit on the page as a banner instead of a toast', async () => {
    pendingActions.current = [
      {
        id: '20fb503685add1f2fe5af4056979dc98',
        kind: 'offboard',
        title: 'Bark exit',
        status: 'This exit is still in progress. Sync Bark to continue it.',
        amountSats: 10_000,
        feeSats: 50_815,
        destination: 'tb1qcurrent',
        txid: null,
        error: null,
      },
    ]
    reviewBarkOffboardAmount.mockResolvedValue(amountReview)
    performBarkOffboard.mockRejectedValue(new BarkOffboardParkedError())
    renderWithProviders(<BarkOffboardPage />)
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-offboard-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('bark-pending-action-banner')).toHaveTextContent(
        'This exit is still in progress. Sync Bark to continue it.',
      )
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  function enableMainnetFiatEntry() {
    walletStoreState.networkMode = 'mainnet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mainnet' }
    walletStoreState.currentAddress = 'bc1qcurrent'
    loadSnapshot.current.networkMode = 'mainnet'
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({
      data: { btcPriceInFiat: 100_000 },
      isPending: false,
    })
  }

  it('BARK-EXIT-13 converts a mainnet fiat amount to sats before review', async () => {
    enableMainnetFiatEntry()
    reviewBarkOffboardAmount.mockResolvedValue({
      ...amountReview,
      destinationAddress: 'bc1qcurrent',
    })
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.getByRole('switch', { name: /Denomination/ })).toBeInTheDocument()
    expect(screen.getByText('USD that should arrive on-chain')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))

    await waitFor(() => {
      expect(reviewBarkOffboardAmount).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountSats: 10_000 }),
      )
    })
    expect(await screen.findByTestId('bark-offboard-fee')).toHaveTextContent('$0.25')
    expect(screen.getByTestId('bark-offboard-onchain-amount')).toHaveTextContent('$10')
    expect(screen.getByTestId('bark-offboard-review-all')).toBeEnabled()
  })

  it('BARK-EXIT-13 rejects an invalid fiat amount without reviewing', () => {
    enableMainnetFiatEntry()
    renderWithProviders(<BarkOffboardPage />)
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))

    expect(reviewBarkOffboardAmount).not.toHaveBeenCalled()
    expect(screen.getByTestId('bark-offboard-review-error')).toHaveTextContent(
      'Enter an amount in USD.',
    )
  })

  it('BARK-EXIT-13 disables review amount when the Bitcoin price is unavailable', () => {
    enableMainnetFiatEntry()
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: true })
    renderWithProviders(<BarkOffboardPage />)

    expect(screen.getByTestId('bark-offboard-review-amount')).toBeDisabled()
    expect(screen.getByTestId('bark-offboard-review-all')).toBeEnabled()
    expect(screen.getByTestId('bark-offboard-fiat-price-unavailable')).toHaveTextContent(
      'Bitcoin price is unavailable.',
    )
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))
    expect(reviewBarkOffboardAmount).not.toHaveBeenCalled()
  })

  it('BARK-EXIT-13 keeps whole sats on signet when fiat mode is on', async () => {
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({
      data: { btcPriceInFiat: 100_000 },
      isPending: false,
    })
    reviewBarkOffboardAmount.mockResolvedValue(amountReview)
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.queryByRole('switch', { name: /Denomination/ })).not.toBeInTheDocument()
    expect(screen.getByText('Satoshis that should arrive on-chain')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bark-offboard-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-offboard-review-amount'))

    await waitFor(() => {
      expect(reviewBarkOffboardAmount).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountSats: 10_000 }),
      )
    })
  })

  it('BARK-SESS-03 hides the exit form while the Bark session is loading', () => {
    loadSnapshot.current.loadPhase = 'loading'
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-offboard-amount')).not.toBeInTheDocument()
  })

  it('BARK-SESS-04 hides the exit form when the Bark session failed to open', () => {
    loadSnapshot.current = {
      ...loadSnapshot.current,
      loadPhase: 'load-error',
      errorMessage: 'signet unreachable',
    }
    renderWithProviders(<BarkOffboardPage />)
    expect(screen.getByTestId('bark-session-load-error')).toBeInTheDocument()
    expect(screen.getByText('signet unreachable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-offboard-amount')).not.toBeInTheDocument()
  })
})
