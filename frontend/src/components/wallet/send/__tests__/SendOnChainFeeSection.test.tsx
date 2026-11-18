import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'

const presets = { ...NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB }

function renderFeeSection(
  overrides: Partial<Parameters<typeof SendOnChainFeeSection>[0]> = {},
) {
  const onSelectPreset = vi.fn()
  const onSelectCustomMode = vi.fn()
  render(
    <InfomodeProvider>
      <SendOnChainFeeSection
        feePresetSelection="Low"
        presetSatPerVbByLabel={presets}
        feeEstimatesRefreshing={false}
        customFeeRate=""
        useCustomFee={false}
        isPending={false}
        onSelectPreset={onSelectPreset}
        setCustomFeeRate={vi.fn()}
        onSelectCustomMode={onSelectCustomMode}
        {...overrides}
      />
    </InfomodeProvider>,
  )
  return { onSelectPreset, onSelectCustomMode }
}

describe('SendOnChainFeeSection', () => {
  it('selects a preset or custom from a wrapping fee switch', async () => {
    const user = userEvent.setup()
    const { onSelectPreset, onSelectCustomMode } = renderFeeSection()

    const group = screen.getByRole('group', { name: 'Fee rate' })
    expect(group.className).toContain('flex-wrap')
    expect(screen.getByRole('button', { name: 'Low (0.50)' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-infomode-id="send-fee-preset-medium"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Medium (2.00)' }))
    expect(onSelectPreset).toHaveBeenCalledWith('Medium', 2)

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(onSelectCustomMode).toHaveBeenCalledOnce()
  })

  it('hides custom when automatic fee caps only offer presets', () => {
    renderFeeSection({ hideCustom: true, feePresetSelection: 'Medium' })

    expect(screen.queryByRole('button', { name: 'Custom' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medium (2.00)' })).toHaveAttribute('aria-pressed', 'true')
  })
})
