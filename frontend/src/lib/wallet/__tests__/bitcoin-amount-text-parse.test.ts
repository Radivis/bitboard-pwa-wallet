import { describe, it, expect } from 'vitest'
import { UX_DUST_FLOOR_SATS } from '@/lib/wallet/bitcoin-dust'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/wallet/bitcoin-display-unit'
import {
  maxSatsInTextFromFormattedBitcoinAmountDisplays,
  parseAllSatsInTextFromFormattedBitcoinAmountDisplays,
  textReflectsSatsInFormattedDisplaysOrLiteral,
} from '@/lib/wallet/bitcoin-amount-text-parse'

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
  const formattedAmount = formatAmountInBitcoinDisplayUnit(sats, unit)
  return `${formattedAmount}${DISPLAY_SUFFIX[unit]}`
}

function mockTestDisplay(sats: number, unit: keyof typeof DISPLAY_SUFFIX): string {
  const formattedAmount = formatAmountInBitcoinDisplayUnit(sats, unit)
  const testSuffix: Record<keyof typeof DISPLAY_SUFFIX, string> = {
    BTC: ' tBTC',
    mBTC: ' tmBTC',
    uBTC: ' tµBTC',
    ksat: ' tksat',
    sat: ' tsat',
  }
  return `${formattedAmount}${testSuffix[unit]}`
}

describe('bitcoin-amount-text-parse', () => {
  it('parses each display unit the same as formatAmount (round trip)', () => {
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const fixtureText = `On-chain\n${mockDisplay(SATS, unit)}\n`
      const all = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(fixtureText)
      expect(all).toEqual([SATS])
    }
  })

  it('parses t-prefixed test-network unit labels', () => {
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const fixtureText = `On-chain\n${mockTestDisplay(SATS, unit)}\n`
      const all = parseAllSatsInTextFromFormattedBitcoinAmountDisplays(fixtureText)
      expect(all).toEqual([SATS])
    }
    const mixed = `${mockTestDisplay(SATS_CUM, 'BTC')}\n${mockTestDisplay(50_000, 'mBTC')}`
    expect(maxSatsInTextFromFormattedBitcoinAmountDisplays(mixed)).toBe(
      Math.max(SATS_CUM, 50_000),
    )
  })

  it('can include zero-sat headline segments when requested', () => {
    const fixtureText = mockDisplay(0, 'BTC')
    expect(parseAllSatsInTextFromFormattedBitcoinAmountDisplays(fixtureText)).toEqual([])
    expect(
      parseAllSatsInTextFromFormattedBitcoinAmountDisplays(fixtureText, {
        includeZeroSats: true,
      }),
    ).toEqual([0])
  })

  it('takes the max of several formatted segments (e.g. headline + breakdown lines)', () => {
    const fixtureText = `On-chain
${mockDisplay(SATS_CUM, 'BTC')}

${mockDisplay(50_000, 'mBTC')}`
    expect(maxSatsInTextFromFormattedBitcoinAmountDisplays(fixtureText)).toBe(
      Math.max(SATS_CUM, 50_000),
    )
  })

  it('parses Lab-prefixed unit labels from BitcoinAmountDisplay', () => {
    const fixtureText = `exactly 0.00000546 Lab BTC would`
    expect(
      textReflectsSatsInFormattedDisplaysOrLiteral(fixtureText, UX_DUST_FLOOR_SATS),
    ).toBe(true)
  })

  it('resolves dust floor sats in every unit or literal sats in prose (dust case)', () => {
    for (const unit of ['BTC', 'mBTC', 'uBTC', 'ksat', 'sat'] as const) {
      const fixtureText = mockDisplay(UX_DUST_FLOOR_SATS, unit)
      expect(
        textReflectsSatsInFormattedDisplaysOrLiteral(fixtureText, UX_DUST_FLOOR_SATS),
      ).toBe(true)
    }
    expect(
      textReflectsSatsInFormattedDisplaysOrLiteral(
        `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats).`,
        UX_DUST_FLOOR_SATS,
      ),
    ).toBe(true)
  })
})
