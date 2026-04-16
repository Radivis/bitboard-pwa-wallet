import { describe, expect, it } from 'vitest'
import {
  recipientAndAmountFromScannedPayload,
  tryParseBitcoinUri,
} from '@/lib/bip21'

describe('tryParseBitcoinUri', () => {
  it('returns null for non-bitcoin URI', () => {
    expect(tryParseBitcoinUri('bc1qxyekrp55knpcpfcz5g0s72eqk6s6e45u3t8a2')).toBe(
      null,
    )
    expect(tryParseBitcoinUri('lightning:lnbc1')).toBe(null)
  })

  it('parses bitcoin: address only', () => {
    const addr =
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    expect(tryParseBitcoinUri(`bitcoin:${addr}`)).toEqual({
      address: addr,
      amountBtc: null,
    })
    expect(tryParseBitcoinUri(`BITCOIN:${addr}`)).toEqual({
      address: addr,
      amountBtc: null,
    })
  })

  it('parses address and amount parameter', () => {
    const addr =
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    expect(
      tryParseBitcoinUri(
        `bitcoin:${addr}?amount=0.00005000&label=foo`,
      ),
    ).toEqual({
      address: addr,
      amountBtc: 0.00005,
    })
  })

  it('decodes percent-encoded address segment', () => {
    const parsed = tryParseBitcoinUri('bitcoin:tb1q%2Ftest%3F')
    expect(parsed).not.toBeNull()
    expect(parsed!.address).toBe('tb1q/test?')
    expect(parsed!.amountBtc).toBeNull()
  })

  it('returns null for empty address after scheme', () => {
    expect(tryParseBitcoinUri('bitcoin:')).toBe(null)
    expect(tryParseBitcoinUri('bitcoin:?amount=1')).toBe(null)
  })

  it('ignores invalid or non-positive amount', () => {
    const addr =
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?amount=0`),
    ).toEqual({ address: addr, amountBtc: null })
    expect(
      tryParseBitcoinUri(`bitcoin:${addr}?amount=not-a-number`),
    ).toEqual({ address: addr, amountBtc: null })
  })
})

describe('recipientAndAmountFromScannedPayload', () => {
  it('returns passthrough for raw address', () => {
    const raw =
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    expect(
      recipientAndAmountFromScannedPayload(raw, 'BTC'),
    ).toEqual({ recipient: raw })
  })

  it('strips to address and formats amount in BTC unit', () => {
    const addr =
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    const out = recipientAndAmountFromScannedPayload(
      `bitcoin:${addr}?amount=0.001`,
      'BTC',
    )
    expect(out.recipient).toBe(addr)
    expect(out.amountStr).toBe('0.00100000')
  })
})
