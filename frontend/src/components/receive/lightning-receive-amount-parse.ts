export type InvoiceAmountFieldParse =
  | { kind: 'amountless' }
  | { kind: 'fixed'; sats: number }
  | { kind: 'invalid' }

/** Parses receive UI amount field: empty or zero → amountless; digits only, capped for safe `Number` conversion. */
export function parseInvoiceAmountField(raw: string): InvoiceAmountFieldParse {
  const trimmedAmount = raw.trim()
  if (trimmedAmount === '') return { kind: 'amountless' }
  if (!/^\d+$/.test(trimmedAmount)) return { kind: 'invalid' }
  if (trimmedAmount.length > 15) return { kind: 'invalid' }
  const sats = Number(trimmedAmount)
  if (!Number.isInteger(sats) || sats < 0) return { kind: 'invalid' }
  if (sats === 0) return { kind: 'amountless' }
  return { kind: 'fixed', sats }
}
