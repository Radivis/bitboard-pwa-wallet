import type { LightningPayment } from '@/lib/lightning-backend-service'

/** Limit stored payment rows per connection inside the encrypted wallet payload. */
export const MAX_STORED_LIGHTNING_PAYMENTS = 500

export function capLightningPaymentsForSnapshot(
  payments: LightningPayment[],
): LightningPayment[] {
  if (payments.length <= MAX_STORED_LIGHTNING_PAYMENTS) {
    return payments
  }
  return [...payments]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_STORED_LIGHTNING_PAYMENTS)
}

export function isLightningPaymentPayload(
  row: unknown,
): row is LightningPayment {
  if (row === null || typeof row !== 'object') return false
  const o = row as Record<string, unknown>
  return (
    typeof o.paymentHash === 'string' &&
    typeof o.pending === 'boolean' &&
    typeof o.amountSats === 'number' &&
    typeof o.memo === 'string' &&
    typeof o.timestamp === 'number' &&
    typeof o.bolt11 === 'string' &&
    (o.direction === 'incoming' || o.direction === 'outgoing') &&
    typeof o.feesPaidSats === 'number'
  )
}

export function parseLightningPaymentsFromJson(json: string): LightningPayment[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLightningPaymentPayload)
  } catch {
    return []
  }
}
