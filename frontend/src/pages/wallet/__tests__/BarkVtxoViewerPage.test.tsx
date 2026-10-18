import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { useBarkExitChainNoticeStore } from '@/lib/bark/bark-exit-seizure-notice'
import { BarkVtxoViewerPage } from '@/pages/wallet/BarkVtxoViewerPage'
import { BARK_VTXO_VIEWER_PAGE_SIZE } from '@/lib/bark/bark-vtxo-viewer-display'
import { renderWithProviders } from '@/test-utils/test-providers'
import type { NetworkMode } from '@/stores/walletStore'
import type { BarkEmergencyExitRow, BarkExitGraph, BarkVtxoList, BarkVtxoRow } from '@/workers/bark-api'

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
    loadPhase: 'loaded' as 'loaded' | 'loading',
    networkMode: 'signet' as NetworkMode | null,
    errorMessage: null as string | null,
    receiveKeyIndex: 0 as number | null,
  },
}))

const syncSnapshot = vi.hoisted(() => ({
  current: {
    syncPhase: 'not-syncing' as const,
    networkMode: 'signet' as NetworkMode | null,
    errorMessage: null as string | null,
    spendableSats: 10_000 as number | null,
    lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
  },
}))

const vtxoListQuery = vi.hoisted(() =>
  vi.fn(() => ({
    data: { tipHeight: null, rows: [] } as BarkVtxoList | undefined,
    isLoading: false,
    isError: false,
    error: null as unknown,
  })),
)

const emergencyExitQuery = vi.hoisted(() =>
  vi.fn(() => ({ data: [] as BarkEmergencyExitRow[] })),
)

const exitTopologyQuery = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined as BarkExitGraph | undefined })),
)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  }
})

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

vi.mock('@/hooks/useBarkVtxoListQuery', () => ({
  useBarkVtxoListQuery: () => vtxoListQuery(),
}))

vi.mock('@/hooks/useBarkEmergencyExitQuery', () => ({
  useBarkEmergencyExitQuery: () => emergencyExitQuery(),
}))

vi.mock('@/hooks/useBarkExitTopologyQuery', () => ({
  useBarkExitTopologyQuery: () => exitTopologyQuery(),
}))

vi.mock('@/hooks/useBarkPendingActionsQuery', () => ({
  useBarkPendingActionsQuery: () => ({ data: [] }),
}))

vi.mock('@/hooks/useBarkHistoryQuery', () => ({
  useBarkHistoryQuery: () => ({ data: [] }),
}))

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useBarkManualSyncMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

function vtxoList(rows: BarkVtxoRow[]): BarkVtxoList {
  return { tipHeight: 50, rows }
}

function sampleRow(overrides: Partial<BarkVtxoRow> & Pick<BarkVtxoRow, 'id'>): BarkVtxoRow {
  return {
    amountSats: 10_000,
    expiryHeight: 100,
    state: 'spendable',
    lockHolder: null,
    registered: false,
    ...overrides,
  }
}

describe('BarkVtxoViewerPage', () => {
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
      spendableSats: 10_000,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
    }
    vtxoListQuery.mockReturnValue({
      data: vtxoList([
        sampleRow({ id: 'spend:0', state: 'spendable', expiryHeight: 100 }),
        sampleRow({ id: 'lock:1', state: 'locked', expiryHeight: 90 }),
        sampleRow({ id: 'spent:2', state: 'spent', expiryHeight: 80 }),
        sampleRow({ id: 'exit:3', state: 'exited', expiryHeight: 70 }),
      ]),
      isLoading: false,
      isError: false,
      error: null,
    })
    emergencyExitQuery.mockReturnValue({ data: [] })
    exitTopologyQuery.mockReturnValue({ data: undefined })
    useBarkExitChainNoticeStore.setState({ notice: null })
  })

  it('BARK-VTX-02 is not the inventory unless Bark is enabled on signet', () => {
    featureState.isBarkEnabled = false
    const disabled = renderWithProviders(<BarkVtxoViewerPage />)
    expect(screen.getByText(/available on Signet and Mainnet when Bark is enabled/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
    disabled.unmount()

    featureState.isBarkEnabled = true
    walletStoreState.networkMode = 'mutinynet'
    walletStoreState.loadedDescriptorWallet = { networkMode: 'mutinynet' }
    renderWithProviders(<BarkVtxoViewerPage />)
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('BARK-SESS-03 shows the Bark session loading screen while the session is loading', () => {
    loadSnapshot.current.loadPhase = 'loading'
    renderWithProviders(<BarkVtxoViewerPage />)
    expect(screen.getByTestId('bark-session-loading')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Establishing Bark session' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('BARK-SESS-04 shows the Bark session error screen when open fails', () => {
    loadSnapshot.current = {
      ...loadSnapshot.current,
      loadPhase: 'load-error',
      errorMessage: 'signet unreachable',
    }
    renderWithProviders(<BarkVtxoViewerPage />)
    expect(screen.getByTestId('bark-session-load-error')).toBeInTheDocument()
    expect(screen.getByText('signet unreachable')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('does not stay on Loading VTXOs while Bark sync holds the session', () => {
    syncSnapshot.current.syncPhase = 'syncing'
    vtxoListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    })

    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.queryByText('Loading VTXOs…')).not.toBeInTheDocument()
    expect(screen.getByTestId('bark-vtxo-waiting-for-sync')).toHaveTextContent(
      'The VTXO list loads when Bark sync finishes.',
    )
    expect(screen.queryByText('No VTXOs in this wallet yet.')).not.toBeInTheDocument()
  })

  it('shows a list error instead of an empty wallet', () => {
    vtxoListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Bark session is not open'),
    })

    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.getByTestId('bark-vtxo-list-error')).toHaveTextContent(
      'Bark session is not open',
    )
    expect(screen.queryByText('Loading VTXOs…')).not.toBeInTheDocument()
    expect(screen.queryByText('No VTXOs in this wallet yet.')).not.toBeInTheDocument()
  })

  it('BARK-VTX-04 hides spent and exited until the toggle is off, and keeps locked visible', () => {
    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.getByTestId('bark-vtxo-card-spend:0')).toBeInTheDocument()
    expect(screen.getByTestId('bark-vtxo-card-lock:1')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-vtxo-card-spent:2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bark-vtxo-card-exit:3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Hide spent and exited'))

    expect(screen.getByTestId('bark-vtxo-card-spent:2')).toBeInTheDocument()
    expect(screen.getByTestId('bark-vtxo-card-exit:3')).toBeInTheDocument()
  })

  it('BARK-VTX-10 shows a started exit, a timelock, an anchor sweep, and a checkpoint seizure while spent and exited are hidden', () => {
    vtxoListQuery.mockReturnValue({
      data: vtxoList([
        sampleRow({ id: 'started:1', state: 'spendable' }),
        sampleRow({ id: 'timelock:2', state: 'exited' }),
        sampleRow({ id: 'swept:5', state: 'spent' }),
        sampleRow({ id: 'seized:3', state: 'spent' }),
        sampleRow({ id: 'claimed:4', state: 'exited' }),
      ]),
      isLoading: false,
      isError: false,
      error: null,
    })
    emergencyExitQuery.mockReturnValue({
      data: [
        { vtxoId: 'started:1', state: 'start', cancelable: true },
        {
          vtxoId: 'timelock:2',
          state: 'awaitingDelta',
          cancelable: false,
          tipHeight: 100,
          confirmedHeight: 90,
          claimableHeight: 130,
        },
      ],
    })
    useBarkExitChainNoticeStore.getState().showNotice(1, 'signet', {
      anchorSweepVtxoIds: ['swept:5'],
      checkpointSeizureVtxoIds: ['seized:3'],
    })

    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.getByTestId('bark-vtxo-exit-phase-started:1')).toHaveTextContent(
      'Emergency exit phase: started',
    )
    expect(screen.getByTestId('bark-vtxo-exit-phase-timelock:2')).toHaveTextContent(
      'Emergency exit phase: waiting for timelock, 10 of 40 blocks',
    )
    expect(screen.getByTestId('bark-vtxo-exit-phase-swept:5')).toHaveTextContent(
      'Emergency exit phase: anchor swept',
    )
    expect(screen.getByTestId('bark-vtxo-exit-phase-seized:3')).toHaveTextContent(
      'Emergency exit phase: checkpoint seized',
    )
    expect(screen.queryByTestId('bark-vtxo-card-claimed:4')).not.toBeInTheDocument()
  })

  it('BARK-VTX-06 filters by a state chip whose count is from the full list', () => {
    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.getByRole('button', { name: 'Spent (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Locked (1)' }))

    expect(screen.getByTestId('bark-vtxo-card-lock:1')).toBeInTheDocument()
    expect(screen.queryByTestId('bark-vtxo-card-spend:0')).not.toBeInTheDocument()
  })

  it('BARK-VTX-07 paginates at 20 cards', () => {
    const rows = Array.from({ length: BARK_VTXO_VIEWER_PAGE_SIZE + 2 }, (_, index) =>
      sampleRow({ id: `row:${index}`, expiryHeight: index }),
    )
    vtxoListQuery.mockReturnValue({ data: vtxoList(rows), isLoading: false, isError: false, error: null })

    renderWithProviders(<BarkVtxoViewerPage />)

    expect(screen.getByTestId('bark-vtxo-card-row:0')).toBeInTheDocument()
    expect(
      screen.queryByTestId(`bark-vtxo-card-row:${BARK_VTXO_VIEWER_PAGE_SIZE}`),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(
      screen.getByTestId(`bark-vtxo-card-row:${BARK_VTXO_VIEWER_PAGE_SIZE}`),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('bark-vtxo-card-row:0')).not.toBeInTheDocument()
  })
})
