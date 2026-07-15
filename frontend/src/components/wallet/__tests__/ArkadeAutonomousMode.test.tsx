import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ArkadeAutonomousModeSwitch } from '@/components/wallet/ArkadeAutonomousModeSwitch'
import { ArkadeExitSection } from '@/components/wallet/ArkadeExitSection'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  }
})

let autonomousActive = false

vi.mock('@/hooks/useArkadeQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useArkadeQueries')>()
  return {
    ...actual,
    useArkadeAutonomousModeStatusQuery: () => ({
      data: {
        active: autonomousActive,
        eligibleCount: 2,
        materialsReadyCount: autonomousActive ? 1 : 1,
        materialsMissingCount: 1,
        cachedOperatorInfoPresent: true,
      },
      isLoading: false,
    }),
    useArkadeAutonomousModeMutation: () => ({
      mutate: (nextActive: boolean) => {
        autonomousActive = nextActive
      },
      isPending: false,
    }),
    useArkadeAutonomousModeActive: () => autonomousActive,
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
    useArkadeUnilateralExitsInProgressQuery: () => ({ data: [], isLoading: false }),
    useArkadeUnilateralExitCompletionFeeQuery: () => ({ data: undefined, isLoading: false }),
  }
})

vi.mock('@/stores/walletStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/walletStore')>()
  const state = {
    ...actual.useWalletStore.getState(),
    networkMode: 'signet' as const,
    activeWalletId: 1,
    currentAddress: 'tb1qexample',
    committedNetworkMode: 'signet' as const,
    arkadeSignerMigrationHint: null,
  }
  return {
    ...actual,
    useWalletStore: Object.assign(
      (selector: (walletState: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  }
})

vi.mock('@/hooks/useArkadeExitFlow', () => ({
  useArkadeExitFlow: () => ({
    setCollaborativeOpen: vi.fn(),
    setUnilateralOpen: vi.fn(),
    setCompleteUnilateralOpen: vi.fn(),
    unilateralExitInProgressSats: 0,
  }),
}))

describe('Arkade autonomous mode UI', () => {
  it('shows autonomous mode image and active copy when enabled', async () => {
    autonomousActive = false

    const user = userEvent.setup()
    const { rerender } = renderWithProviders(<ArkadeAutonomousModeSwitch />)

    expect(
      screen.queryByRole('img', { name: /castaway building a small boat/i }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'Autonomous mode' }))
    expect(screen.getByRole('dialog', { name: 'Missing exit materials' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    rerender(<ArkadeAutonomousModeSwitch />)
    expect(screen.getByRole('img', { name: /castaway building a small boat/i })).toHaveAttribute(
      'src',
      '/autonomous_mode_w600.jpg',
    )
    expect(screen.getByTestId('arkade-autonomous-materials-missing')).toBeInTheDocument()
    expect(screen.getByText(/operator unreachable/i)).toBeInTheDocument()
  })

  it('disables collaborative exit while autonomous mode is active', async () => {
    autonomousActive = true
    renderWithProviders(<ArkadeExitSection />)
    expect(screen.getByRole('button', { name: 'Collaborative exit' })).toBeDisabled()
    expect(screen.getByTestId('arkade-exit-collab-unavailable')).toHaveTextContent(
      /autonomous mode/i,
    )
  })
})
