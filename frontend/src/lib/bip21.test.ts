import { describe, expect, it } from 'vitest'
import {
  type ParsedBitcoinUri,
  preferredRecipientFromBitcoinUri,
  recipientAndAmountFromScannedPayload,
  tryParseBitcoinUri,
} from '@/lib/bip21'

const addr = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

const uriBase = (): ParsedBitcoinUri => ({
  address: addr,
  amountBtc: null,
  lightningParam: null,
})

describe('tryParseBitcoinUri', () => {
  it('returns null for non-bitcoin URI', () => {
    expect(
      tryParseBitcoinUri('bc1qxyekrp55knpcpfcz5g0s72eqk6s6e45u3t8a2'),
    ).toBe(null)
    expect(tryParseBitcoinUri('lightning:lnbc1')).toBe(null)
  })

  it('parses bitcoin: address only', () => {
    expect(tryParseBitcoinUri(`bitcoin:${addr}`)).toEqual(uriBase())
    expect(tryParseBitcoinUri(`BITCOIN:${addr}`)).toEqual(uriBase())
  })

  it('parses address and amount parameter', () => {
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?amount=0.00005000&label=foo`),
    ).toEqual({
      address: addr,
      amountBtc: 0.00005,
      lightningParam: null,
    })
  })

  it('parses lightning= query parameter', () => {
    const ln = 'lntbs1testinvoiceplaceholder123456789'
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?lightning=${ln}`),
    ).toEqual({
      address: addr,
      amountBtc: null,
      lightningParam: ln,
    })
  })

  it('parses LIGHTNING query key case-insensitively', () => {
    const ln = 'lntbs1caseinsensitivebolt11stub'
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?LIGHTNING=${ln}`),
    ).toEqual({
      address: addr,
      amountBtc: null,
      lightningParam: ln,
    })
  })

  it('parses Amount query key case-insensitively', () => {
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?Amount=0.001&label=foo`),
    ).toEqual({
      address: addr,
      amountBtc: 0.001,
      lightningParam: null,
    })
  })

  it('decodes percent-encoded address segment', () => {
    const parsed = tryParseBitcoinUri('bitcoin:tb1q%2Ftest%3F')
    expect(parsed).not.toBeNull()
    expect(parsed!.address).toBe('tb1q/test?')
    expect(parsed!.amountBtc).toBeNull()
    expect(parsed!.lightningParam).toBeNull()
  })

  it('returns null for empty address after scheme', () => {
    expect(tryParseBitcoinUri('bitcoin:')).toBe(null)
    expect(tryParseBitcoinUri('bitcoin:?amount=1')).toBe(null)
  })

  it('ignores invalid or non-positive amount', () => {
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?amount=0`),
    ).toEqual(uriBase())
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?amount=not-a-number`),
    ).toEqual(uriBase())
  })
})

describe('preferredRecipientFromBitcoinUri', () => {
  it('prefers valid lightning=BOLT11 when present', () => {
    const ln = 'lntbs1prefertestbolt11xxxxxxxxxxxx'
    expect(
      preferredRecipientFromBitcoinUri({
        address: addr,
        amountBtc: null,
        lightningParam: ln,
      }),
    ).toBe(ln)
  })

  it('falls back to on-chain address when lightning= is unreadable LN', () => {
    expect(
      preferredRecipientFromBitcoinUri({
        address: addr,
        amountBtc: null,
        lightningParam: 'bad-invoice-prefix',
      }),
    ).toBe(addr)
  })

  it('normalizes lightning: prefix inside lightning=', () => {
    const ln = 'lntbs1short'
    expect(
      preferredRecipientFromBitcoinUri({
        address: addr,
        amountBtc: null,
        lightningParam: `lightning:${ln}`,
      }),
    ).toBe(ln)
  })
})

describe('recipientAndAmountFromScannedPayload', () => {
  it('returns passthrough for raw address', () => {
    expect(recipientAndAmountFromScannedPayload(addr, 'BTC')).toEqual({
      recipient: addr,
    })
  })

  it('strips to address and formats amount in BTC unit', () => {
    const out = recipientAndAmountFromScannedPayload(
      `bitcoin:${addr}?amount=0.001`,
      'BTC',
    )
    expect(out.recipient).toBe(addr)
    expect(out.amountStr).toBe('0.00100000')
  })

  it('uses Bolt11 recipient when lightning= is present', () => {
    const ln = 'lntbs1unifiedqrsendflowplaceholder123456'
    const out = recipientAndAmountFromScannedPayload(
      `bitcoin:${addr}?amount=0.001&lightning=${ln}`,
      'BTC',
    )
    expect(out.recipient).toBe(ln)
    expect(out.amountStr).toBe('0.00100000')
  })
})
