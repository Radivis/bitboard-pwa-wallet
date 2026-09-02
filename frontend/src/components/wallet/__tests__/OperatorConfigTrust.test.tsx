import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { OperatorConfigTrustModal } from '@/components/wallet/OperatorConfigTrustModal'
import { ArkadeOperatorTrustGate } from '@/components/wallet/ArkadeOperatorTrustGate'
import { ArkadeAutonomousModeSwitch } from '@/components/wallet/ArkadeAutonomousModeSwitch'

const reviewMutate = vi.fn()
const acceptMutate = vi.fn()
let operatorTrustReviewingInAutonomous = false

vi.mock('@/hooks/useArkadeQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useArkadeQueries')>()
  return {
    ...actual,
    useOperatorTrustStatusQuery: () => ({
      data: {
        operatorTrustPending: true,
        reviewingInAutonomous: operatorTrustReviewingInAutonomous,
      },
      isLoading: false,
    }),
    useOperatorConfigDiffQuery: () => ({
      isLoading: false,
      data: {
        entries: [
          {
            fieldKey: 'digest',
            fieldLabel: 'Config digest',
            acceptedValue: 'digest-a',
            pendingValue: 'digest-b',
          },
        ],
      },
    }),
    useReviewOperatorConfigInAutonomousMutation: () => ({
      mutate: reviewMutate,
      isPending: false,
    }),
    useAcceptOperatorConfigMutation: () => ({
      mutate: acceptMutate,
      isPending: false,
    }),
    useArkadeAutonomousModeStatusQuery: () => ({
      data: {
        active: true,
        eligibleCount: 1,
        materialsReadyCount: 1,
        materialsMissingCount: 0,
        cachedOperatorInfoPresent: true,
        operatorTrustPending: true,
        canExitAutonomous: false,
      },
      isLoading: false,
    }),
    useArkadeAutonomousModeMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
  }
})

describe('Operator config trust UI', () => {
  it('shows exactly two modal actions with review as the primary default', () => {
    operatorTrustReviewingInAutonomous = false
    renderWithProviders(<OperatorConfigTrustModal open />)

    const reviewButton = screen.getByRole('button', {
      name: 'Review changes safely in autonomous mode',
    })
    const acceptButton = screen.getByRole('button', {
      name: 'Trust Arkade operator and accept changes',
    })
    expect(reviewButton).toBeInTheDocument()
    expect(acceptButton).toBeInTheDocument()
    expect(reviewButton).toHaveFocus()
  })

  it('routes modal actions to review and accept mutations', async () => {
    operatorTrustReviewingInAutonomous = false
    const user = userEvent.setup()
    renderWithProviders(<OperatorConfigTrustModal open />)

    await user.click(
      screen.getByRole('button', { name: 'Review changes safely in autonomous mode' }),
    )
    expect(reviewMutate).toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Trust Arkade operator and accept changes' }),
    )
    expect(acceptMutate).toHaveBeenCalled()
  })

  it('shows two review-banner actions including continue review in autonomous mode', async () => {
    operatorTrustReviewingInAutonomous = true
    reviewMutate.mockClear()
    acceptMutate.mockClear()
    const user = userEvent.setup()
    renderWithProviders(<ArkadeOperatorTrustGate />)

    expect(screen.getByTestId('arkade-operator-trust-review-banner')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue review safely in autonomous mode' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Trust Arkade operator and accept changes' }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Continue review safely in autonomous mode' }),
    )
    expect(reviewMutate).toHaveBeenCalled()
  })

  it('disables autonomous switch off while operator trust is pending', () => {
    renderWithProviders(<ArkadeAutonomousModeSwitch />)
    expect(screen.getByRole('switch', { name: 'Autonomous mode' })).toBeDisabled()
    expect(screen.getByText(/accept operator changes before leaving autonomous mode/i)).toBeInTheDocument()
  })
})
