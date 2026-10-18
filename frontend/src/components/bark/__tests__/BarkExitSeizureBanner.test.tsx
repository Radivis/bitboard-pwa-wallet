import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { BarkExitSeizureBanner } from '@/components/bark/BarkExitSeizureBanner'
import {
  BARK_ANCHOR_SWEEP_WARNING,
  BARK_CHECKPOINT_SEIZURE_WARNING,
} from '@/lib/bark/bark-exit-seizure'
import {
  barkExitChainNoticeIds,
  useBarkExitChainNoticeStore,
} from '@/lib/bark/bark-exit-seizure-notice'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  activeWalletId: 1 as number | null,
  walletStatus: 'unlocked' as 'unlocked' | 'locked',
  loadedDescriptorWallet: { networkMode: 'signet' as NetworkMode },
}))

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const clearExitChainNotice = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ clearExitChainNotice }),
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

describe('BarkExitSeizureBanner', () => {
  beforeEach(() => {
    useBarkExitChainNoticeStore.setState({ notice: null })
    clearExitChainNotice.mockReset()
    clearExitChainNotice.mockResolvedValue(undefined)
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'unlocked'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
  })

  it('BARK-SYNC-11 shows both sections and dismisses only the chosen list', async () => {
    useBarkExitChainNoticeStore.getState().showNotice(1, 'signet', {
      anchorSweepVtxoIds: ['vtxo-a'],
      checkpointSeizureVtxoIds: ['vtxo-b'],
    })
    renderWithProviders(<BarkExitSeizureBanner />)

    const banner = screen.getByTestId('bark-exit-seizure-banner')
    expect(banner).toHaveTextContent(BARK_ANCHOR_SWEEP_WARNING)
    expect(banner).toHaveTextContent(BARK_CHECKPOINT_SEIZURE_WARNING)
    expect(screen.getByTestId('bark-exit-anchor-sweep-ids')).toHaveTextContent('vtxo-a')
    expect(screen.getByTestId('bark-exit-checkpoint-seizure-ids')).toHaveTextContent('vtxo-b')

    fireEvent.click(screen.getByTestId('bark-exit-anchor-sweep-dismiss'))

    await waitFor(() => {
      expect(screen.queryByTestId('bark-exit-anchor-sweep-ids')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('bark-exit-checkpoint-seizure-ids')).toHaveTextContent('vtxo-b')
    expect(clearExitChainNotice).toHaveBeenCalledWith('sweep')
    expect(barkExitChainNoticeIds(1, 'signet')).toEqual({
      anchorSweepVtxoIds: [],
      checkpointSeizureVtxoIds: ['vtxo-b'],
    })
  })

  it('BARK-SYNC-11 hides the banner while locked and shows it again after unlock', () => {
    useBarkExitChainNoticeStore.getState().showNotice(1, 'signet', {
      anchorSweepVtxoIds: ['vtxo-a'],
      checkpointSeizureVtxoIds: [],
    })
    walletStoreState.walletStatus = 'locked'
    const { rerender } = renderWithProviders(<BarkExitSeizureBanner />)

    expect(screen.queryByTestId('bark-exit-seizure-banner')).not.toBeInTheDocument()
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual(['vtxo-a'])

    walletStoreState.walletStatus = 'unlocked'
    rerender(<BarkExitSeizureBanner />)
    expect(screen.getByTestId('bark-exit-seizure-banner')).toBeInTheDocument()
  })

  it('BARK-SYNC-11 does not show another wallet notice', () => {
    useBarkExitChainNoticeStore.getState().showNotice(2, 'signet', {
      anchorSweepVtxoIds: ['vtxo-a'],
      checkpointSeizureVtxoIds: [],
    })
    renderWithProviders(<BarkExitSeizureBanner />)
    expect(screen.queryByTestId('bark-exit-seizure-banner')).not.toBeInTheDocument()
  })
})
