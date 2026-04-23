import { describe, it, expect } from 'vitest'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import {
  maxSatsInTextFromFormattedBitcoinAmountDisplays,
  parseAllSatsInTextFromFormattedBitcoinAmountDisplays,
  textReflectsSatsInFormattedDisplaysOrLiteral,
} from '@/lib/bitcoin-amount-text-parse'

const SATS = 100_000
const SATS_CUM = 300_000

const DISPLAY_SUFFIX: Record<
  'BTC' | 'mBTC' | 'uBTC' | 'ksat' | 'sat',
  string
> = {
  BTC: ' BTC',
  mBTC: ' mBTC',
  uBTC: ' µBTC',
  ksat: ' ksat',
  sat: ' sat',
}

function mockDisplay(sats: number, unit: keyof typeof DISPLAY_SUFFIX): string {
  const n = formatAmountInBitcoinDisplayUnit(sats, unit)
  return `${n}${DISPLAY_SUFFIX[unit]}`
}

describe('bitcoin-amount-text-parse', () => {
  it('parses each display unit the same as formatAmount (round trip)', () => {
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const t = `On-chain\n${mockDisplay(SATS, unit)}\n`
      const all = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(t)
      expect(all).toEqual([SATS])
    }
  })

  it('takes the max of several formatted segments (e.g. headline + breakdown lines)', () => {
    const t = `On-chain
${mockDisplay(SATS_CUM, 'BTC')}

${mockDisplay(50_000, 'mBTC')}`
    expect(maxSatsInTextFromFormattedBitcoinAmountDisplays(t)).toBe(
      Math.max(SATS_CUM, 50_000),
    )
  })

  it('resolves 546 sats in every unit or literal 546 in prose (dust case)', () => {
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const t = mockDisplay(546, unit)
      expect(textReflectsSatsInFormattedDisplaysOrLiteral(t, 546)).toBe(true)
    }
    expect(
      textReflectsSatsInFormattedDisplaysOrLiteral(
        'Amount was below the minimum output size (546 sats).',
        546,
      ),
    ).toBe(true)
  })
})
