import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'

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
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'signet' as const,
    activeWalletId: 1,
    currentAddress: 'tb1qexample',
    committedNetworkMode: 'signet' as const,
  }
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (walletState: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ password: 'test-password' }),
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({
    isLoading: false,
    data: { confirmedSats: 1000, totalSats: 1000 },
  }),
  useArkadeDelegateInfoQuery: () => ({ data: null }),
  useArkadeRenewMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeExitCandidatesQuery: () => ({ data: [], isLoading: false }),
  useArkadeBumperInfoQuery: () => ({ data: null, isLoading: false }),
  useArkadeCollaborativeExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCollaborativeExitFeeQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      txFeeRate: '2',
      intentFeeConfigured: {
        offchainInput: true,
        onchainInput: false,
        offchainOutput: false,
        onchainOutput: true,
      },
      estimatedTotalFeeSats: 500,
      estimatedReceiveSats: 99_500,
    },
  }),
  useArkadeUnilateralExitFeeQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      chainTxCount: 2,
      projectedUnrollSteps: 1,
      projectedWaitSteps: 0,
      feeRateSatPerVb: 5,
      estimatedPackageFeeSats: 2_000,
      bumperBalanceSats: 5_000,
      bumperSufficient: true,
    },
  }),
  useArkadeUnilateralUnrollMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useArkadeCompleteUnilateralExitMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => ({ data: 'tark1qtest', isLoading: false }),
  }
})

vi.mock('@/lib/arkade/arkade-session-service', () => ({
  openArkadeSessionForWallet: vi.fn(),
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({ getAddress: vi.fn() }),
}))

describe('ArkadeExitSection', () => {
  it('shows collaborative and unilateral exit actions', () => {
    const { container } = renderWithProviders(<ArkadeExitSection />)
    expect(screen.getByRole('button', { name: 'Collaborative exit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unilateral exit' })).toBeInTheDocument()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.collaborativeExit}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.unilateralExit}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[data-infomode-id="${ARKADE_INFOMODE_IDS.learnAboutExits}"]`),
    ).not.toBeNull()
  })

  it('shows collaborative fee estimate in the exit dialog', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ArkadeExitSection />)
    await user.click(screen.getByRole('button', { name: 'Collaborative exit' }))
    await waitFor(() => {
      expect(screen.getByText('Operator fees (estimate)')).toBeInTheDocument()
    })
    expect(screen.getByText(/Estimated operator fee/i)).toBeInTheDocument()
  })
})
