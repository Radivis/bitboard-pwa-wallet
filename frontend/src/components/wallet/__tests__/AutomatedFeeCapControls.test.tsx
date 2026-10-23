import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { AutomatedFeeCapControls } from '@/components/wallet/AutomatedFeeCapControls'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'

const presets = { ...NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB }

function renderControls(onMaxFeeRateChange = vi.fn()) {
  render(
    <InfomodeProvider>
      <AutomatedFeeCapControls
        warningTestId="fee-cap-warning"
        maxFeeInputId="fee-cap-max"
        maxFeeTestId="fee-cap-max-rate"
        maxFeeRateSatPerVb={20}
        onMaxFeeRateChange={onMaxFeeRateChange}
        feePresetSelection="Medium"
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        isPending={false}
        onSelectPreset={vi.fn()}
      />
    </InfomodeProvider>,
  )
  return { onMaxFeeRateChange }
}

describe('AutomatedFeeCapControls', () => {
  it('shows the congestion warning, the max rate, and no custom fee', () => {
    renderControls()

    expect(screen.getByTestId('fee-cap-warning')).toHaveTextContent(
      /set a reasonable maximum for the fee rate/i,
    )
    expect(screen.getByTestId('fee-cap-max-rate')).toHaveValue(20)
    expect(screen.queryByRole('button', { name: 'Custom' })).not.toBeInTheDocument()
  })

  it('reports a positive max and ignores a non-positive entry', () => {
    const { onMaxFeeRateChange } = renderControls()
    const maxFeeInput = screen.getByTestId('fee-cap-max-rate')

    fireEvent.change(maxFeeInput, { target: { value: '12.5' } })
    expect(onMaxFeeRateChange).toHaveBeenCalledWith(12.5)

    onMaxFeeRateChange.mockClear()
    fireEvent.change(maxFeeInput, { target: { value: '0' } })
    fireEvent.change(maxFeeInput, { target: { value: '' } })
    expect(onMaxFeeRateChange).not.toHaveBeenCalled()
  })
})
