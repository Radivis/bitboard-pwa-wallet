import { describe, expect, it } from 'vitest'
import { normalizeSendRecipient } from '../normalize-send-recipient'

const addr = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

describe('normalizeSendRecipient', () => {
  it('returns normalized bare address', () => {
    expect(normalizeSendRecipient(`  ${addr}  `)).toBe(addr)
  })

  it('strips bitcoin: prefix from bare address input', () => {
    expect(normalizeSendRecipient(`bitcoin:${addr}`)).toBe(addr)
  })

  it('prefers BIP21 lightning param when valid', () => {
    const ln = 'lntbs1testinvoiceplaceholder123456789'
    expect(
      normalizeSendRecipient(`bitcoin:${addr}?lightning=${ln}`),
    ).toBe(ln)
  })

  it('strips lightning: prefix from LNURL', () => {
    const lnurl = 'lnurl1dp68gurn8ghj7um9wfm'
    expect(normalizeSendRecipient(`lightning:${lnurl}`)).toBe(lnurl)
  })

  it('preserves lnurlp scheme recipient', () => {
    const lnurlp = 'lnurlp://pay.example.com/.well-known/lnurlp/user'
    expect(normalizeSendRecipient(lnurlp)).toBe(lnurlp)
  })

  it('strips a zero-width space inside a bech32 address', () => {
    const polluted = `${addr.slice(0, 12)}\u200B${addr.slice(12)}`
    expect(normalizeSendRecipient(polluted)).toBe(addr)
  })

  it('strips a leading byte-order mark', () => {
    expect(normalizeSendRecipient(`\uFEFF${addr}`)).toBe(addr)
  })

  it('strips surrounding markdown backticks and whitespace', () => {
    expect(normalizeSendRecipient(`\n\`${addr}\`\n`)).toBe(addr)
  })

  it('strips a trailing non-breaking space', () => {
    expect(normalizeSendRecipient(`${addr}\u00A0`)).toBe(addr)
  })
})
