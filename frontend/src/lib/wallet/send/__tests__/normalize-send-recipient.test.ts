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
})
