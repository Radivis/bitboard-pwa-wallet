import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeDashboardBalance } from '@/components/wallet/ArkadeDashboardBalance'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'
import { ArkadeReceive } from '@/components/receive/ArkadeReceive'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import type { NetworkMode } from '@/stores/walletStore'

const balanceQueryMock = vi.hoisted(() => vi.fn())
const addressQueryMock = vi.hoisted(() => vi.fn())
const walletStoreState = vi.hoisted(() => ({
  networkMode: 'signet' as NetworkMode,
  arkadeReceiveAddress: 'tark1qqexample' as string | null,
  arkadeBalance: null as { confirmedSats: number; totalSats: number } | null,
}))

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

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => balanceQueryMock(),
  useArkadeRecoverableVtxoFeeQuery: () => ({ isLoading: false, data: null }),
  useArkadeRecoverRecoverableVtxosMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeAddressQuery: () => addressQueryMock(),
  useArkadeDelegateInfoQuery: () => ({ data: { fee: '10' } }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeVtxoExpiryQuery: () => ({
    isLoading: false,
    data: {
      earliestExpiresAt: Math.floor(Date.now() / 1000) + 86_400,
      expiringSoonCount: 0,
    },
  }),
  useArkadeOperatorScheduledSessionQuery: () => ({
    isLoading: false,
    data: null,
  }),
  useArkadeNewAddressMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeExitCandidatesQuery: () => ({ data: [], isLoading: false }),
  useArkadeBumperInfoQuery: () => ({ data: null, isLoading: false }),
  useArkadeCollaborativeExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCollaborativeExitFeeQuery: () => ({ isLoading: false, isError: false, data: null }),
  useArkadeUnilateralExitFeeQuery: () => ({ isLoading: false, isError: false, data: null }),
  useArkadeUnrollMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCompleteExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeSignerMigrationMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
  useArkadeSignerMigrationPartialResultQuery: () => ({ data: null }),
}))

vi.mock('@/hooks/useArkadeDashboardQueries', () => ({
  useArkadeSyncMetadataQuery: () => ({ data: { isStaleArkade: false } }),
}))

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
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (state: typeof walletStoreState) => unknown) => selector(walletStoreState),
      { getState: () => walletStoreState },
    ),
  }
})

vi.mock('@/components/wallet/ArkadeExitSection', () => ({
  ArkadeExitSection: () => (
    <div data-infomode-id="arkade-exit-section">Exit to on-chain</div>
  ),
}))

describe('Arkade Infomode zones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    walletStoreState.networkMode = 'signet'
    walletStoreState.arkadeReceiveAddress = 'tark1qqexample'
    balanceQueryMock.mockReturnValue({
      isLoading: false,
      data: { confirmedSats: 42_000, totalSats: 42_000 },
    })
    addressQueryMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: 'tark1qqexample',
    })
  })

  it('ArkadeDashboardBalance exposes arkade-dashboard-balance infomode id', () => {
    const { container } = renderWithProviders(<ArkadeDashboardBalance />)
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.dashboardBalance}"]`),
    ).not.toBeNull()
    expect(screen.getByText('Arkade balance')).toBeInTheDocument()
  })

  it('ArkadePanel exposes management card action infomode ids', () => {
    const { container } = renderWithProviders(<ArkadePanel />)
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.managementPanel}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.delegatorFee}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.exitSection}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.boardFromOnchain}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.renewVtxos}"]`),
    ).not.toBeNull()
  })

  it('ArkadeReceive exposes arkade-receive-address infomode id', () => {
    const { container } = renderWithProviders(<ArkadeReceive />)
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.receiveAddress}"]`),
    ).not.toBeNull()
  })
})
