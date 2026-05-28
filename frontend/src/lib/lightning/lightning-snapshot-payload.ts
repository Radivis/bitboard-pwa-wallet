import type { LightningPayment } from '@/lib/lightning/lightning-backend-service'

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
  const rowRecord = row as Record<string, unknown>
  return (
    typeof rowRecord.paymentHash === 'string' &&
    typeof rowRecord.pending === 'boolean' &&
    typeof rowRecord.amountSats === 'number' &&
    typeof rowRecord.memo === 'string' &&
    typeof rowRecord.timestamp === 'number' &&
    typeof rowRecord.bolt11 === 'string' &&
    (rowRecord.direction === 'incoming' || rowRecord.direction === 'outgoing') &&
    typeof rowRecord.feesPaidSats === 'number'
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
