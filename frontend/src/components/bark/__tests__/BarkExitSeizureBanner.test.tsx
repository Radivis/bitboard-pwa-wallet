import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { BarkExitSeizureBanner } from '@/components/bark/BarkExitSeizureBanner'
import { BARK_EXIT_SEIZURE_WARNING } from '@/lib/bark/bark-exit-seizure'
import {
  barkExitSeizureNoticeIds,
  useBarkExitSeizureNoticeStore,
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

const clearExitSeizureNotice = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({ clearExitSeizureNotice }),
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
    useBarkExitSeizureNoticeStore.setState({ notice: null })
    clearExitSeizureNotice.mockReset()
    clearExitSeizureNotice.mockResolvedValue(undefined)
    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'signet'
    walletStoreState.activeWalletId = 1
    walletStoreState.walletStatus = 'unlocked'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'signet' }
  })

  it('BARK-SYNC-11 shows a dismissible banner and hides it after the account write', async () => {
    useBarkExitSeizureNoticeStore.getState().showNotice(1, 'signet', ['vtxo-a'])
    renderWithProviders(<BarkExitSeizureBanner />)

    expect(screen.getByTestId('bark-exit-seizure-banner')).toHaveTextContent(
      BARK_EXIT_SEIZURE_WARNING,
    )

    fireEvent.click(screen.getByTestId('bark-exit-seizure-dismiss'))

    await waitFor(() => {
      expect(screen.queryByTestId('bark-exit-seizure-banner')).not.toBeInTheDocument()
    })
    expect(clearExitSeizureNotice).toHaveBeenCalledOnce()
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual([])
  })

  it('BARK-SYNC-11 hides the banner while locked and shows it again after unlock', () => {
    useBarkExitSeizureNoticeStore.getState().showNotice(1, 'signet', ['vtxo-a'])
    walletStoreState.walletStatus = 'locked'
    const { rerender } = renderWithProviders(<BarkExitSeizureBanner />)

    expect(screen.queryByTestId('bark-exit-seizure-banner')).not.toBeInTheDocument()
    expect(barkExitSeizureNoticeIds(1, 'signet')).toEqual(['vtxo-a'])

    walletStoreState.walletStatus = 'unlocked'
    rerender(<BarkExitSeizureBanner />)
    expect(screen.getByTestId('bark-exit-seizure-banner')).toBeInTheDocument()
  })

  it('BARK-SYNC-11 does not show another wallet notice', () => {
    useBarkExitSeizureNoticeStore.getState().showNotice(2, 'signet', ['vtxo-a'])
    renderWithProviders(<BarkExitSeizureBanner />)
    expect(screen.queryByTestId('bark-exit-seizure-banner')).not.toBeInTheDocument()
  })
})
