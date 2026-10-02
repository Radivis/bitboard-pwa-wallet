import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BarkBoardPage } from '@/pages/wallet/BarkBoardPage'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const reviewBarkBoard = vi.hoisted(() => vi.fn())
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

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  useEsploraFeePresets: () => ({ data: { Low: 1, Medium: 2, High: 4 }, isFetching: false }),
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
  return { ...actual, reviewBarkBoard }
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
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    reviewBarkBoard.mockReset()
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
      /after the server's required confirmations/,
    )
    expect(screen.getByTestId('bark-board-confirm')).toBeInTheDocument()
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
})
