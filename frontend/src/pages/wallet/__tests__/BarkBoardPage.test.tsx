import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BarkBoardPage } from '@/pages/wallet/BarkBoardPage'
import { renderWithProviders } from '@/test-utils/test-providers'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
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

const reviewBarkBoard = vi.hoisted(() => vi.fn())
const repriceBarkBoardOnchain = vi.hoisted(() => vi.fn())
const performBarkBoard = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
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

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  useEsploraFeePresets: () => ({ data: { Low: 1, Medium: 2, High: 4 }, isFetching: false }),
}))

vi.mock('@/hooks/useBarkLoadLifecycleSnapshot', () => ({
  useBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
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
    (selector: (state: { broadcastTransaction: typeof broadcastTransaction }) => unknown) =>
      selector({ broadcastTransaction }),
    { getState: () => ({ broadcastTransaction }) },
  ),
}))

vi.mock('@/lib/bark/review-bark-board', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bark/review-bark-board')>()
  return { ...actual, reviewBarkBoard, repriceBarkBoardOnchain }
})

vi.mock('@/lib/bark/perform-bark-board', () => ({
  performBarkBoard,
}))

vi.mock('@/lib/bark/bark-board-live-deps', () => ({
  barkBoardReviewDeps: () => ({
    estimateBoardOffchainFee: vi.fn(),
    prepareBoardFunding: vi.fn(),
    prepareOnchainSend: vi.fn(),
  }),
  barkBoardPerformDeps: () => ({
    signFundingPsbt: vi.fn(),
    submitBoardPsbt: vi.fn(),
    applyUnconfirmedFundingTx: vi.fn(),
    persistOnchainChangeset: vi.fn(),
    startOnchainBackgroundSync: vi.fn(),
    syncBark: vi.fn(),
  }),
}))

describe('BarkBoardPage', () => {
  beforeEach(() => {
    useFiatDenominationStore.setState({ fiatDenominationMode: false, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: false })
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    loadSnapshot.current = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
    reviewBarkBoard.mockReset()
    repriceBarkBoardOnchain.mockReset()
    performBarkBoard.mockReset()
    navigate.mockReset()
    broadcastTransaction.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('BARK-BOARD-03 is not a funding form unless Bark is enabled on signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkBoardPage />)
    expect(screen.getByText(/available on Signet and Mainnet when Bark is enabled/)).toBeInTheDocument()
    expect(screen.queryByTestId('bark-board-amount')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkBoardPage />)
    expect(screen.queryByTestId('bark-board-amount')).not.toBeInTheDocument()
  })

  it('BARK-BOARD-04 shows the on-chain fee, Bark board fee, and net VTXO before confirm', async () => {
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))

    expect(await screen.findByTestId('bark-board-onchain-fee')).toHaveTextContent('210')
    expect(screen.getByTestId('bark-board-offchain-fee')).toHaveTextContent('40')
    expect(screen.getByTestId('bark-board-net-vtxo')).toHaveTextContent('9960')
    expect(screen.getByTestId('bark-board-confirmation-note')).toHaveTextContent(
      /sends coins from your on-chain wallet into Bark/,
    )
    expect(screen.getByTestId('bark-board-confirmation-note')).not.toHaveTextContent(/Signet/)
    expect(screen.getByTestId('bark-board-confirmation-note')).toHaveTextContent(
      /after the server's required confirmations/,
    )
    expect(screen.getByTestId('bark-board-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('bark-board-fee-rate')).toBeInTheDocument()
  })

  it('BARK-BOARD-10 rebuilds the funding PSBT at the selected fee rate and confirms that PSBT', async () => {
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    repriceBarkBoardOnchain.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'repriced-psbt',
      onchainFeeSats: 420,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    performBarkBoard.mockResolvedValue({ localWalletWarning: null })
    renderWithProviders(<BarkBoardPage />)
    expect(screen.queryByTestId('bark-board-fee-rate')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))

    expect(await screen.findByTestId('bark-board-fee-rate')).toBeInTheDocument()
    await waitFor(() => {
      expect(reviewBarkBoard).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountSats: 10_000, feeRateSatPerVb: 2 }),
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'High (4.00)' }))

    await waitFor(() => {
      expect(repriceBarkBoardOnchain).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fundingAddress: 'tb1qboard',
          psbtBase64: 'reviewed-psbt',
          grossAmountSats: 10_000,
        }),
        4,
      )
    })
    expect(reviewBarkBoard).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('bark-board-onchain-fee')).toHaveTextContent('420')
    expect(screen.getByTestId('bark-board-offchain-fee')).toHaveTextContent('40')
    expect(screen.getByTestId('bark-board-net-vtxo')).toHaveTextContent('9960')

    fireEvent.click(screen.getByTestId('bark-board-confirm'))
    await waitFor(() => {
      expect(performBarkBoard).toHaveBeenCalledWith(expect.anything(), 'repriced-psbt')
    })
  })

  it('BARK-BOARD-10 keeps confirm disabled until a custom fee rate is a positive number', async () => {
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    repriceBarkBoardOnchain.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'custom-psbt',
      onchainFeeSats: 350,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))
    fireEvent.click(await screen.findByRole('button', { name: 'Custom' }))

    expect(screen.getByTestId('bark-board-confirm')).toBeDisabled()
    expect(repriceBarkBoardOnchain).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Custom fee rate (sat/vB)'), {
      target: { value: '3.5' },
    })
    await waitFor(() => {
      expect(repriceBarkBoardOnchain).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ psbtBase64: 'reviewed-psbt' }),
        3.5,
      )
    })
    expect(reviewBarkBoard).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('bark-board-onchain-fee')).toHaveTextContent('350')
    expect(screen.getByTestId('bark-board-confirm')).toBeEnabled()
  })

  it('BARK-BOARD-10 ignores a fee rebuild that finishes after a newer rate was chosen', async () => {
    const reviewed = {
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    }
    reviewBarkBoard.mockResolvedValue(reviewed)
    let resolveHigh: (review: typeof reviewed) => void = () => {}
    repriceBarkBoardOnchain.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHigh = resolve
        }),
    )
    repriceBarkBoardOnchain.mockResolvedValueOnce({
      ...reviewed,
      psbtBase64: 'low-psbt',
      onchainFeeSats: 100,
    })
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))
    fireEvent.click(await screen.findByRole('button', { name: 'High (4.00)' }))
    await waitFor(() => {
      expect(repriceBarkBoardOnchain).toHaveBeenCalledTimes(1)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Low (1.00)' }))
    expect(await screen.findByTestId('bark-board-onchain-fee')).toHaveTextContent('100')

    resolveHigh({ ...reviewed, psbtBase64: 'stale-psbt', onchainFeeSats: 999 })
    await waitFor(() => {
      expect(screen.getByTestId('bark-board-confirm')).toBeEnabled()
    })
    expect(screen.getByTestId('bark-board-onchain-fee')).toHaveTextContent('100')
    expect(screen.getByTestId('bark-board-onchain-fee')).not.toHaveTextContent('999')
  })

  it('BARK-BOARD-10 keeps confirm disabled after a fee rebuild error', async () => {
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    repriceBarkBoardOnchain.mockRejectedValue(new Error('fee rate rejected'))
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))
    fireEvent.click(await screen.findByRole('button', { name: 'High (4.00)' }))

    expect(await screen.findByTestId('bark-board-reprice-error')).toHaveTextContent(
      'fee rate rejected',
    )
    expect(screen.getByTestId('bark-board-confirm')).toBeDisabled()
    expect(screen.getByTestId('bark-board-onchain-fee')).toHaveTextContent('210')

    fireEvent.click(screen.getByRole('button', { name: 'Medium (2.00)' }))
    await waitFor(() => {
      expect(screen.getByTestId('bark-board-confirm')).toBeEnabled()
    })
    expect(screen.queryByTestId('bark-board-reprice-error')).not.toBeInTheDocument()
  })

  it('BARK-BOARD-06 does not toast success when the board submission fails', async () => {
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    performBarkBoard.mockRejectedValue(new Error('server rejected the board'))
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))
    fireEvent.click(await screen.findByTestId('bark-board-confirm'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(broadcastTransaction).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  function enableMainnetFiatEntry() {
    walletStoreState.networkMode = 'mainnet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mainnet' }
    loadSnapshot.current.networkMode = 'mainnet'
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({
      data: { btcPriceInFiat: 100_000 },
      isPending: false,
    })
  }

  it('BARK-BOARD-09 converts a mainnet fiat amount to sats before review', async () => {
    enableMainnetFiatEntry()
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'bc1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    renderWithProviders(<BarkBoardPage />)
    expect(screen.getByRole('switch', { name: /Denomination/ })).toBeInTheDocument()
    expect(screen.getByText('Amount (USD)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))

    await waitFor(() => {
      expect(reviewBarkBoard).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountSats: 10_000 }),
      )
    })
    expect(await screen.findByTestId('bark-board-onchain-fee')).toHaveTextContent('$0.21')
    expect(screen.getByTestId('bark-board-offchain-fee')).toHaveTextContent('$0.04')
    expect(screen.getByTestId('bark-board-net-vtxo')).toHaveTextContent('$9.96')
  })

  it('BARK-BOARD-09 rejects an invalid fiat amount without reviewing', () => {
    enableMainnetFiatEntry()
    renderWithProviders(<BarkBoardPage />)
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))

    expect(reviewBarkBoard).not.toHaveBeenCalled()
    expect(screen.getByTestId('bark-board-review-error')).toHaveTextContent(
      'Enter an amount in USD.',
    )
  })

  it('BARK-BOARD-09 disables review when the Bitcoin price is unavailable', () => {
    enableMainnetFiatEntry()
    fiatRatesQueryMock.mockReturnValue({ data: undefined, isPending: true })
    renderWithProviders(<BarkBoardPage />)

    expect(screen.getByTestId('bark-board-review')).toBeDisabled()
    expect(screen.getByTestId('bark-board-fiat-price-unavailable')).toHaveTextContent(
      'Bitcoin price is unavailable.',
    )
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))
    expect(reviewBarkBoard).not.toHaveBeenCalled()
  })

  it('BARK-BOARD-09 keeps whole sats on signet when fiat mode is on', async () => {
    useFiatDenominationStore.setState({ fiatDenominationMode: true, defaultFiatCurrency: 'USD' })
    fiatRatesQueryMock.mockReturnValue({
      data: { btcPriceInFiat: 100_000 },
      isPending: false,
    })
    reviewBarkBoard.mockResolvedValue({
      fundingAddress: 'tb1qboard',
      psbtBase64: 'reviewed-psbt',
      onchainFeeSats: 210,
      offchainFeeSats: 40,
      netVtxoSats: 9_960,
      grossAmountSats: 10_000,
    })
    renderWithProviders(<BarkBoardPage />)
    expect(screen.queryByRole('switch', { name: /Denomination/ })).not.toBeInTheDocument()
    expect(screen.getByText('Satoshis')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bark-board-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-board-review'))

    await waitFor(() => {
      expect(reviewBarkBoard).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountSats: 10_000 }),
      )
    })
  })

  it('BARK-SESS-03 hides the funding form while the Bark session is loading', () => {
    loadSnapshot.current.loadPhase = 'loading'
    renderWithProviders(<BarkBoardPage />)
    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-board-amount')).not.toBeInTheDocument()
  })

  it('BARK-SESS-04 hides the funding form when the Bark session failed to open', () => {
    loadSnapshot.current = {
      ...loadSnapshot.current,
      loadPhase: 'load-error',
      errorMessage: 'signet unreachable',
    }
    renderWithProviders(<BarkBoardPage />)
    expect(screen.getByTestId('bark-session-load-error')).toBeInTheDocument()
    expect(screen.getByText('signet unreachable')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-board-amount')).not.toBeInTheDocument()
  })
})
