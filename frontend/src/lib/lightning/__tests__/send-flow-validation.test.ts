import { describe, expect, it, vi } from 'vitest'
import {
  canBuildLightningSend,
  getDecodedBolt11ForSend,
  isBolt11DecodeOk,
  isBolt11NetworkMismatch,
  isLightningPayloadLengthOk,
  isLightningPayloadLengthOkForSend,
  isLightningSendMode,
  needsUserLightningAmount,
  resolveLightningPayAmountSats,
} from '../send-flow-validation'

vi.mock('@/lib/lightning/lightning-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/lightning/lightning-utils')>()
  return {
    ...actual,
    tryDecodeBolt11Invoice: (paymentRequest: string) => {
      if (paymentRequest.includes('amountless')) {
        return { satoshi: 0, millisatoshi: 0 }
      }
      if (paymentRequest.startsWith('lntbs1')) {
        return { satoshi: 5_000, millisatoshi: 5_000_000 }
      }
      return null
    },
  }
})

const lnInvoice = 'lntbs1testinvoiceplaceholder123456789'
const amountlessInvoice = 'lntbs1amountlessbolt11stubxxxxxxxx'
const lnurlRecipient = 'lnurl1dp68gurn8ghj7um9wfm'

describe('isLightningSendMode', () => {
  it('is true when lightning is available and destination is valid', () => {
    expect(isLightningSendMode(true, lnInvoice)).toBe(true)
  })

  it('is true for LNURL-pay recipient', () => {
    expect(isLightningSendMode(true, lnurlRecipient)).toBe(true)
  })

  it('is false when lightning is unavailable', () => {
    expect(isLightningSendMode(false, lnInvoice)).toBe(false)
  })
})

describe('getDecodedBolt11ForSend', () => {
  it('returns decoded invoice for valid bolt11', () => {
    expect(getDecodedBolt11ForSend(lnInvoice)).toEqual({
      satoshi: 5_000,
      millisatoshi: 5_000_000,
    })
  })

  it('returns null for non-invoice input', () => {
    expect(getDecodedBolt11ForSend('user@getalby.com')).toBeNull()
  })
})

describe('isBolt11NetworkMismatch', () => {
  it('detects signet invoice on testnet mode', () => {
    expect(isBolt11NetworkMismatch(lnInvoice, 'testnet')).toBe(true)
  })

  it('is false when networks match', () => {
    expect(isBolt11NetworkMismatch(lnInvoice, 'signet')).toBe(false)
  })
})

describe('needsUserLightningAmount', () => {
  it('is true for lightning address', () => {
    expect(
      needsUserLightningAmount({
        isLightningSendMode: true,
        normalizedRecipient: 'user@getalby.com',
        decodedBolt11: null,
      }),
    ).toBe(true)
  })

  it('is true for LNURL-pay', () => {
    expect(
      needsUserLightningAmount({
        isLightningSendMode: true,
        normalizedRecipient: lnurlRecipient,
        decodedBolt11: null,
      }),
    ).toBe(true)
  })

  it('is true for amountless bolt11', () => {
    expect(
      needsUserLightningAmount({
        isLightningSendMode: true,
        normalizedRecipient: amountlessInvoice,
        decodedBolt11: getDecodedBolt11ForSend(amountlessInvoice),
      }),
    ).toBe(true)
  })

  it('is false for fixed-amount bolt11', () => {
    const decoded = getDecodedBolt11ForSend(lnInvoice)
    expect(
      needsUserLightningAmount({
        isLightningSendMode: true,
        normalizedRecipient: lnInvoice,
        decodedBolt11: decoded,
      }),
    ).toBe(false)
  })
})

describe('resolveLightningPayAmountSats', () => {
  it('uses invoice amount when present', () => {
    expect(
      resolveLightningPayAmountSats({
        isLightningSendMode: true,
        normalizedRecipient: lnInvoice,
        decodedBolt11: getDecodedBolt11ForSend(lnInvoice),
        amountSats: 1_000,
      }),
    ).toBe(5_000)
  })

  it('falls back to form amount for amountless invoice', () => {
    expect(
      resolveLightningPayAmountSats({
        isLightningSendMode: true,
        normalizedRecipient: amountlessInvoice,
        decodedBolt11: getDecodedBolt11ForSend(amountlessInvoice),
        amountSats: 2_000,
      }),
    ).toBe(2_000)
  })
})

describe('isBolt11DecodeOk', () => {
  it('passes for non-bolt11 recipients', () => {
    expect(isBolt11DecodeOk('user@getalby.com', null)).toBe(true)
  })

  it('fails when bolt11 cannot be decoded', () => {
    expect(isBolt11DecodeOk('lntbs1bad', null)).toBe(false)
  })
})

describe('isLightningPayloadLengthOk', () => {
  it('accepts payloads within limit', () => {
    expect(isLightningPayloadLengthOk(lnInvoice)).toBe(true)
  })
})

describe('isLightningPayloadLengthOkForSend', () => {
  it('passes when not in lightning mode', () => {
    expect(isLightningPayloadLengthOkForSend(false, 'x'.repeat(9999))).toBe(
      true,
    )
  })
})

describe('canBuildLightningSend', () => {
  const decoded = getDecodedBolt11ForSend(lnInvoice)

  const base = {
    normalizedRecipient: lnInvoice,
    amountSats: 1_000,
    recipientFormatValid: true,
    isLightningSendMode: true,
    matchingLightningConnectionsCount: 1,
    hasLightningWalletSelected: true,
    bolt11NetworkMismatch: false,
    bolt11DecodeOk: true,
    needsUserLightningAmount: false,
    lightningPayAmountSats: 5_000,
    selectedLnBalanceQuerySuccess: true,
    selectedLnBalanceSats: 10_000,
    decodedBolt11: decoded,
  }

  it('allows valid lightning send', () => {
    expect(canBuildLightningSend(base)).toBe(true)
  })

  it('rejects network mismatch', () => {
    expect(
      canBuildLightningSend({ ...base, bolt11NetworkMismatch: true }),
    ).toBe(false)
  })

  it('allows LNURL-pay when amount and balance are valid', () => {
    expect(
      canBuildLightningSend({
        ...base,
        normalizedRecipient: lnurlRecipient,
        needsUserLightningAmount: true,
        lightningPayAmountSats: 2_000,
        decodedBolt11: null,
        bolt11DecodeOk: true,
        amountSats: 2_000,
      }),
    ).toBe(true)
  })

  it('rejects when balance is insufficient', () => {
    expect(
      canBuildLightningSend({
        ...base,
        selectedLnBalanceSats: 100,
      }),
    ).toBe(false)
  })

  it('rejects when no connections match', () => {
    expect(
      canBuildLightningSend({
        ...base,
        matchingLightningConnectionsCount: 0,
      }),
    ).toBe(false)
  })
})
