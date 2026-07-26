import { describe, expect, it } from 'vitest'
import {
  defaultMaxFeeRateSatPerVb,
  resolveAutomatedStepFeeRateSatPerVb,
} from '@/lib/arkade/unilateral-exit-automation-fees'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'

const presets = { ...NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB }

describe('defaultMaxFeeRateSatPerVb', () => {
  it('returns 10 when high preset is below 5', () => {
    expect(defaultMaxFeeRateSatPerVb(4)).toBe(10)
  })

  it('returns twice high when that exceeds 10', () => {
    expect(defaultMaxFeeRateSatPerVb(10)).toBe(20)
    expect(defaultMaxFeeRateSatPerVb(15)).toBe(30)
  })
})

describe('resolveAutomatedStepFeeRateSatPerVb', () => {
  it('returns live preset when within cap', () => {
    expect(
      resolveAutomatedStepFeeRateSatPerVb('Medium', presets, 50),
    ).toEqual({ feeRateSatPerVb: presets.Medium, capExceeded: false })
  })

  it('flags capExceeded when live preset exceeds max', () => {
    expect(
      resolveAutomatedStepFeeRateSatPerVb('High', { ...presets, High: 25 }, 20),
    ).toEqual({ feeRateSatPerVb: 25, capExceeded: true })
  })

  it('allows preset exactly at cap', () => {
    expect(
      resolveAutomatedStepFeeRateSatPerVb('High', { ...presets, High: 20 }, 20),
    ).toEqual({ feeRateSatPerVb: 20, capExceeded: false })
  })
})
