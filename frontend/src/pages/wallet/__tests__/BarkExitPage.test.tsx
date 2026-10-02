import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { BarkExitPage } from '@/pages/wallet/BarkExitPage'
import { BarkOffboardParkedError } from '@/lib/bark/perform-bark-exit'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  currentAddress: 'tb1qcurrent' as string | null,
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const syncSnapshot = vi.hoisted(() => ({
  current: { spendableSats: 50_000 as number | null },
}))

const feePresets = vi.hoisted(() => ({
  data: { Low: 0.5, Medium: 2, High: 1 } as
    | { Low: number; Medium: number; High: number }
    | undefined,
}))

const reviewBarkExitAmount = vi.hoisted(() => vi.fn())
const reviewBarkExitAll = vi.hoisted(() => vi.fn())
const performBarkExit = vi.hoisted(() => vi.fn())
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

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  useEsploraFeePresets: () => ({ data: feePresets.data }),
}))

vi.mock('@/lib/bark/review-bark-exit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bark/review-bark-exit')>()
  return { ...actual, reviewBarkExitAmount, reviewBarkExitAll }
})

vi.mock('@/lib/bark/perform-bark-exit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bark/perform-bark-exit')>()
  return { ...actual, performBarkExit }
})

vi.mock('@/lib/bark/bark-exit-live-deps', () => ({
  barkExitReviewDeps: () => ({
    estimateSendOnchain: vi.fn(),
    estimateOffboardAll: vi.fn(),
  }),
  barkExitPerformDeps: () => ({
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
  feeRateSatPerVb: 1,
  feeSats: 250,
  onchainAmountSats: 10_000,
  grossAmountSats: 10_250,
}

describe('BarkExitPage', () => {
  beforeEach(() => {
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.currentAddress = 'tb1qcurrent'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
    syncSnapshot.current = { spendableSats: 50_000 }
    feePresets.data = { Low: 0.5, Medium: 2, High: 1 }
    reviewBarkExitAmount.mockReset()
    reviewBarkExitAll.mockReset()
    performBarkExit.mockReset()
    navigate.mockReset()
    getNewAddress.mockReset()
    broadcastTransaction.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('BARK-EXIT-03 is not a form unless Bark is enabled on signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkExitPage />)
    expect(screen.getByText(/available on Signet and Mainnet when Bark is enabled/)).toBeInTheDocument()
    expect(screen.queryByTestId('bark-exit-amount')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkExitPage />)
    expect(screen.queryByTestId('bark-exit-amount')).not.toBeInTheDocument()
  })

  it('BARK-EXIT-04 shows the server fee and the on-chain amount before confirm', async () => {
    reviewBarkExitAmount.mockResolvedValue(amountReview)
    renderWithProviders(<BarkExitPage />)
    fireEvent.change(screen.getByTestId('bark-exit-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-exit-review-amount'))

    expect(reviewBarkExitAmount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destinationAddress: 'tb1qcurrent',
        amountSats: 10_000,
        feeRateSatPerVb: 1,
      }),
    )
    expect(await screen.findByTestId('bark-exit-fee-rate')).toHaveTextContent('1')
    expect(screen.getByTestId('bark-exit-fee')).toHaveTextContent('250')
    expect(screen.getByTestId('bark-exit-onchain-amount')).toHaveTextContent('10000')
    expect(screen.getByTestId('bark-exit-destination')).toHaveTextContent('tb1qcurrent')
    expect(screen.queryByTestId('bark-exit-confirm')).toBeInTheDocument()
  })

  it('uses the high fee fallback when Esplora presets are missing', async () => {
    feePresets.data = undefined
    reviewBarkExitAmount.mockResolvedValue({ ...amountReview, feeRateSatPerVb: 10 })
    renderWithProviders(<BarkExitPage />)
    fireEvent.change(screen.getByTestId('bark-exit-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-exit-review-amount'))

    await waitFor(() => {
      expect(reviewBarkExitAmount).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ feeRateSatPerVb: 10 }),
      )
    })
  })

  it('confirm uses the current address and does not reveal a new one', async () => {
    reviewBarkExitAmount.mockResolvedValue(amountReview)
    performBarkExit.mockResolvedValue({ txid: 'cc', syncWarning: null })
    renderWithProviders(<BarkExitPage />)
    fireEvent.change(screen.getByTestId('bark-exit-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-exit-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-exit-confirm'))

    await waitFor(() => {
      expect(performBarkExit).toHaveBeenCalledWith(expect.anything(), amountReview)
    })
    expect(getNewAddress).not.toHaveBeenCalled()
    expect(broadcastTransaction).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('disables exit entire balance when spendable sats are zero', () => {
    syncSnapshot.current = { spendableSats: 0 }
    renderWithProviders(<BarkExitPage />)
    expect(screen.getByTestId('bark-exit-review-all')).toBeDisabled()
  })

  it('BARK-EXIT-07 does not toast success when the exit throws', async () => {
    reviewBarkExitAmount.mockResolvedValue(amountReview)
    performBarkExit.mockRejectedValue(new Error('insufficient funds'))
    renderWithProviders(<BarkExitPage />)
    fireEvent.change(screen.getByTestId('bark-exit-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-exit-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-exit-confirm'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('BARK-EXIT-08 tells the user to sync when the exit is parked', async () => {
    reviewBarkExitAmount.mockResolvedValue(amountReview)
    performBarkExit.mockRejectedValue(new BarkOffboardParkedError())
    renderWithProviders(<BarkExitPage />)
    fireEvent.change(screen.getByTestId('bark-exit-amount'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('bark-exit-review-amount'))
    fireEvent.click(await screen.findByTestId('bark-exit-confirm'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'This exit is still in progress. Sync Bark to continue it.',
      )
    })
    expect(toast.success).not.toHaveBeenCalled()
  })
})
