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

function hasLightningPaymentCoreFields(rowRecord: Record<string, unknown>): boolean {
  const pendingKnown =
    typeof rowRecord.isPending === 'boolean' || typeof rowRecord.pending === 'boolean'
  return (
    typeof rowRecord.paymentHash === 'string' &&
    pendingKnown &&
    typeof rowRecord.amountSats === 'number' &&
    typeof rowRecord.memo === 'string' &&
    typeof rowRecord.timestamp === 'number' &&
    typeof rowRecord.bolt11 === 'string' &&
    (rowRecord.direction === 'incoming' || rowRecord.direction === 'outgoing') &&
    typeof rowRecord.feesPaidSats === 'number'
  )
}

export function normalizeLightningPaymentPayload(row: unknown): LightningPayment | null {
  if (row === null || typeof row !== 'object') return null
  const rowRecord = row as Record<string, unknown>
  if (!hasLightningPaymentCoreFields(rowRecord)) return null
  return {
    paymentHash: rowRecord.paymentHash as string,
    isPending:
      typeof rowRecord.isPending === 'boolean'
        ? rowRecord.isPending
        : Boolean(rowRecord.pending),
    amountSats: rowRecord.amountSats as number,
    memo: rowRecord.memo as string,
    timestamp: rowRecord.timestamp as number,
    bolt11: rowRecord.bolt11 as string,
    direction: rowRecord.direction as LightningPayment['direction'],
    feesPaidSats: rowRecord.feesPaidSats as number,
  }
}

export function isLightningPaymentPayload(
  row: unknown,
): row is LightningPayment {
  return normalizeLightningPaymentPayload(row) != null
}

export function parseLightningPaymentsFromJson(json: string): LightningPayment[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeLightningPaymentPayload)
      .filter((payment): payment is LightningPayment => payment != null)
  } catch {
    return []
  }
}
