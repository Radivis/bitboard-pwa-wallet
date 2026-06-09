import { describe, expect, it } from 'vitest'
import {
  canBuildOnChainSend,
  canProceedToSendReview,
  isLabWithNoBalance,
  isSendFiatRateOk,
} from '../send-build-eligibility'

const recipient = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

describe('isLabWithNoBalance', () => {
  it('is true when lab balance is zero or unknown', () => {
    expect(isLabWithNoBalance({ networkMode: 'lab', labBalanceSats: 0 })).toBe(
      true,
    )
    expect(
      isLabWithNoBalance({ networkMode: 'lab', labBalanceSats: null }),
    ).toBe(true)
  })

  it('is false when lab has balance', () => {
    expect(
      isLabWithNoBalance({ networkMode: 'lab', labBalanceSats: 10_000 }),
    ).toBe(false)
  })

  it('is false for non-lab networks', () => {
    expect(
      isLabWithNoBalance({ networkMode: 'signet', labBalanceSats: null }),
    ).toBe(false)
  })
})

describe('canBuildOnChainSend', () => {
  const base = {
    isLightningSendMode: false,
    isArkadeSendMode: false,
    normalizedRecipient: recipient,
    networkMode: 'signet' as const,
    amountSats: 10_000,
    confirmedBalance: 500_000,
    isLabWithNoBalance: false,
    useCustomFee: false,
    customFeeParsed: null,
  }

  it('allows valid on-chain send', () => {
    expect(canBuildOnChainSend(base)).toBe(true)
  })

  it('rejects lightning send mode', () => {
    expect(canBuildOnChainSend({ ...base, isLightningSendMode: true })).toBe(
      false,
    )
  })

  it('rejects arkade send mode', () => {
    expect(canBuildOnChainSend({ ...base, isArkadeSendMode: true })).toBe(false)
  })

  it('rejects invalid address', () => {
    expect(
      canBuildOnChainSend({ ...base, normalizedRecipient: 'bad' }),
    ).toBe(false)
  })

  it('rejects amount above balance', () => {
    expect(
      canBuildOnChainSend({ ...base, amountSats: 600_000 }),
    ).toBe(false)
  })

  it('rejects lab with no balance', () => {
    expect(
      canBuildOnChainSend({ ...base, isLabWithNoBalance: true }),
    ).toBe(false)
  })

  it('rejects custom fee when parsed value is null', () => {
    expect(
      canBuildOnChainSend({
        ...base,
        useCustomFee: true,
        customFeeParsed: null,
      }),
    ).toBe(false)
  })
})

describe('isSendFiatRateOk', () => {
  it('passes when not in mainnet fiat mode', () => {
    expect(
      isSendFiatRateOk({
        mainnetFiatMode: false,
        isLightningSendMode: false,
        needsUserLightningAmount: true,
        btcPriceInFiat: null,
        fiatRatesQueryIsError: true,
      }),
    ).toBe(true)
  })

  it('passes for lightning invoice with fixed amount', () => {
    expect(
      isSendFiatRateOk({
        mainnetFiatMode: true,
        isLightningSendMode: true,
        needsUserLightningAmount: false,
        btcPriceInFiat: null,
        fiatRatesQueryIsError: true,
      }),
    ).toBe(true)
  })

  it('requires usable spot price in mainnet fiat mode', () => {
    expect(
      isSendFiatRateOk({
        mainnetFiatMode: true,
        isLightningSendMode: false,
        needsUserLightningAmount: true,
        btcPriceInFiat: 50_000,
        fiatRatesQueryIsError: false,
      }),
    ).toBe(true)
    expect(
      isSendFiatRateOk({
        mainnetFiatMode: true,
        isLightningSendMode: false,
        needsUserLightningAmount: true,
        btcPriceInFiat: null,
        fiatRatesQueryIsError: false,
      }),
    ).toBe(false)
  })
})

describe('canProceedToSendReview', () => {
  it('uses lightning path when in lightning send mode', () => {
    expect(
      canProceedToSendReview({
        isLightningSendMode: true,
        isArkadeSendMode: false,
        canBuildLightning: true,
        canBuildArkade: false,
        canBuildOnChain: false,
        fiatRateOk: true,
      }),
    ).toBe(true)
    expect(
      canProceedToSendReview({
        isLightningSendMode: true,
        isArkadeSendMode: false,
        canBuildLightning: false,
        canBuildArkade: true,
        canBuildOnChain: true,
        fiatRateOk: true,
      }),
    ).toBe(false)
  })

  it('uses arkade path when in arkade send mode', () => {
    expect(
      canProceedToSendReview({
        isLightningSendMode: false,
        isArkadeSendMode: true,
        canBuildLightning: false,
        canBuildArkade: true,
        canBuildOnChain: false,
        fiatRateOk: true,
      }),
    ).toBe(true)
  })

  it('uses on-chain path otherwise', () => {
    expect(
      canProceedToSendReview({
        isLightningSendMode: false,
        isArkadeSendMode: false,
        canBuildLightning: false,
        canBuildArkade: false,
        canBuildOnChain: true,
        fiatRateOk: true,
      }),
    ).toBe(true)
  })

  it('requires fiat rate ok', () => {
    expect(
      canProceedToSendReview({
        isLightningSendMode: false,
        isArkadeSendMode: false,
        canBuildLightning: false,
        canBuildArkade: false,
        canBuildOnChain: true,
        fiatRateOk: false,
      }),
    ).toBe(false)
  })
})
