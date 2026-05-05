import { describe, expect, it } from 'vitest'
import { parseInvoiceAmountField } from '@/components/receive/LightningReceive'

describe('parseInvoiceAmountField', () => {
  it('treats blank as amountless', () => {
    expect(parseInvoiceAmountField('')).toEqual({ kind: 'amountless' })
    expect(parseInvoiceAmountField('   ')).toEqual({ kind: 'amountless' })
  })

  it('treats zero as amountless', () => {
    expect(parseInvoiceAmountField('0')).toEqual({ kind: 'amountless' })
    expect(parseInvoiceAmountField('00')).toEqual({ kind: 'amountless' })
  })

  it('parses fixed integer sats', () => {
    expect(parseInvoiceAmountField('21')).toEqual({ kind: 'fixed', sats: 21 })
    expect(parseInvoiceAmountField('1')).toEqual({ kind: 'fixed', sats: 1 })
  })

  it('rejects non-digit and scientific-like input', () => {
    expect(parseInvoiceAmountField('1e6')).toEqual({ kind: 'invalid' })
    expect(parseInvoiceAmountField('12.5')).toEqual({ kind: 'invalid' })
    expect(parseInvoiceAmountField('-3')).toEqual({ kind: 'invalid' })
    expect(parseInvoiceAmountField('abc')).toEqual({ kind: 'invalid' })
  })

  it('rejects digit strings too long for safe numeric handling', () => {
    expect(parseInvoiceAmountField('1'.repeat(16))).toEqual({ kind: 'invalid' })
  })
})
