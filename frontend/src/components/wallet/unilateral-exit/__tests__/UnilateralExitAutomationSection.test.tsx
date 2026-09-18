import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnilateralExitAutomationSection } from '@/components/wallet/unilateral-exit/UnilateralExitAutomationSection'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'

vi.mock('@/components/wallet/send/SendOnChainFeeSection', () => ({
  SendOnChainFeeSection: () => <div data-testid="mock-send-onchain-fee-section" />,
}))

const presets = { ...NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB }

describe('UnilateralExitAutomationSection', () => {
  it('shows warning and max fee input when proceed automatically is enabled', () => {
    render(
      <UnilateralExitAutomationSection
        proceedAutomatically
        feePresetLabel="Medium"
        maxFeeRateSatPerVb={20}
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        isPending={false}
        onProceedAutomaticallyChange={vi.fn()}
        onFeePresetChange={vi.fn()}
        onMaxFeeRateChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('unilateral-exit-max-fee-warning')).toBeInTheDocument()
    expect(screen.getByTestId('unilateral-exit-max-fee-rate')).toHaveValue(20)
    expect(screen.getByTestId('mock-send-onchain-fee-section')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Custom' })).not.toBeInTheDocument()
  })

  it('hides max fee controls when proceed automatically is off', () => {
    render(
      <UnilateralExitAutomationSection
        proceedAutomatically={false}
        feePresetLabel="Medium"
        maxFeeRateSatPerVb={10}
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        isPending={false}
        onProceedAutomaticallyChange={vi.fn()}
        onFeePresetChange={vi.fn()}
        onMaxFeeRateChange={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('unilateral-exit-max-fee-warning')).not.toBeInTheDocument()
    expect(screen.queryByTestId('unilateral-exit-max-fee-rate')).not.toBeInTheDocument()
  })

  it('calls onProceedAutomaticallyChange when toggling the switch', async () => {
    const user = userEvent.setup()
    const onProceedAutomaticallyChange = vi.fn()

    render(
      <UnilateralExitAutomationSection
        proceedAutomatically={false}
        feePresetLabel="Medium"
        maxFeeRateSatPerVb={10}
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        isPending={false}
        onProceedAutomaticallyChange={onProceedAutomaticallyChange}
        onFeePresetChange={vi.fn()}
        onMaxFeeRateChange={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('unilateral-exit-proceed-automatically'))
    expect(onProceedAutomaticallyChange).toHaveBeenCalledWith(true)
  })

  it('shows paused reason when automation is paused', () => {
    render(
      <UnilateralExitAutomationSection
        proceedAutomatically
        feePresetLabel="High"
        maxFeeRateSatPerVb={10}
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        isPending={false}
        pausedReason="feeCapExceeded"
        onProceedAutomaticallyChange={vi.fn()}
        onFeePresetChange={vi.fn()}
        onMaxFeeRateChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('unilateral-exit-automation-paused')).toHaveTextContent(
      /exceeds your maximum/i,
    )
  })
})
