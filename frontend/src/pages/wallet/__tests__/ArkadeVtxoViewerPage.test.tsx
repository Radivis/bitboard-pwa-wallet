import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ArkadeVtxoViewerPage } from '@/pages/wallet/ArkadeVtxoViewerPage'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ARKADE_VTXO_VIEWER_PAGE_SIZE } from '@/lib/arkade/arkade-vtxo-viewer-display'
import type { ArkadeVtxoListResult, ArkadeVtxoRowBase } from '@/workers/arkade-api'

const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as const,
}))

const vtxoListQueryMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: undefined as ArkadeVtxoListResult | undefined,
    isLoading: false,
  })),
)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

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
  const useWalletStoreMock = (selector: (state: typeof walletStoreState) => unknown) =>
    selector(walletStoreState)
  Object.assign(useWalletStoreMock, {
    getState: () => walletStoreState,
  })
  return {
    ...actual,
    useWalletStore: useWalletStoreMock,
    selectCommittedNetworkMode: (state: typeof walletStoreState) => state.networkMode,
  }
})

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeVtxoListQuery: () => vtxoListQueryMock(),
}))

vi.mock('@/hooks/useArkadeLifecycleSnapshots', () => ({
  useArkadeRailSnapshot: () => ({ syncPhase: 'idle' }),
  useArkadeLoadLifecycleSnapshot: () => ({ loadPhase: 'ready' }),
  useArkadeSyncLifecycleSnapshot: () => ({
    syncPhase: 'idle',
    warningMessage: null,
  }),
}))

vi.mock('@/hooks/useRailManualSyncMutations', () => ({
  useArkadeManualSyncMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

function sampleRow(
  overrides: Partial<ArkadeVtxoRowBase> & Pick<ArkadeVtxoRowBase, 'id'>,
): ArkadeVtxoRowBase {
  return {
    amountSats: 10_000,
    createdAt: 1_700_000_000,
    expiresAt: 1_800_000_000,
    classification: 'confirmed',
    isPreconfirmed: false,
    isRecoverable: false,
    isUnrolled: false,
    isSwept: false,
    isSpent: false,
    isUnilateralExitPrepared: false,
    ...overrides,
  }
}

describe('ArkadeVtxoViewerPage', () => {
  beforeEach(() => {
    walletStoreState.networkMode = 'signet'
    vtxoListQueryMock.mockReturnValue({
      data: {
        rows: [
          sampleRow({ id: 'active:0' }),
          sampleRow({
            id: 'final:1',
            classification: 'finalized',
            isSpent: true,
          }),
        ],
        fromSnapshotSyncedAt: null,
      },
      isLoading: false,
    })
  })

  it('ArkadeVtxoViewerPage_hide_finalized_default', () => {
    renderWithProviders(<ArkadeVtxoViewerPage />)

    expect(screen.getByTestId('arkade-vtxo-card-active:0')).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-vtxo-card-final:1')).not.toBeInTheDocument()
  })

  it('shows finalized cards when hide finalized is turned off', () => {
    renderWithProviders(<ArkadeVtxoViewerPage />)

    fireEvent.click(screen.getByLabelText('Hide finalized'))

    expect(screen.getByTestId('arkade-vtxo-card-final:1')).toBeInTheDocument()
  })

  it('filters by classification chip', () => {
    vtxoListQueryMock.mockReturnValue({
      data: {
        rows: [
          sampleRow({ id: 'confirmed:0', classification: 'confirmed' }),
          sampleRow({ id: 'exiting:1', classification: 'exiting', isUnrolled: true }),
        ],
        fromSnapshotSyncedAt: null,
      },
      isLoading: false,
    })

    renderWithProviders(<ArkadeVtxoViewerPage />)

    fireEvent.click(screen.getByRole('button', { name: /Unilateral exit \(1\)/ }))

    expect(screen.getByTestId('arkade-vtxo-card-exiting:1')).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-vtxo-card-confirmed:0')).not.toBeInTheDocument()
  })

  it('paginate_vtxos_page_boundary', () => {
    const rows = Array.from({ length: ARKADE_VTXO_VIEWER_PAGE_SIZE + 2 }, (_, index) =>
      sampleRow({ id: `row:${index}` }),
    )
    vtxoListQueryMock.mockReturnValue({
      data: { rows, fromSnapshotSyncedAt: null },
      isLoading: false,
    })

    renderWithProviders(<ArkadeVtxoViewerPage />)

    expect(screen.getByTestId('arkade-vtxo-card-row:0')).toBeInTheDocument()
    expect(screen.queryByTestId(`arkade-vtxo-card-row:${ARKADE_VTXO_VIEWER_PAGE_SIZE}`)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(
      screen.getByTestId(`arkade-vtxo-card-row:${ARKADE_VTXO_VIEWER_PAGE_SIZE}`),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('arkade-vtxo-card-row:0')).not.toBeInTheDocument()
  })
})
