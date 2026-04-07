import { describe, expect, it } from 'vitest'
import {
  capLightningPaymentsForSnapshot,
  isLightningPaymentPayload,
  MAX_STORED_LIGHTNING_PAYMENTS,
  parseLightningPaymentsFromJson,
} from '@/lib/lightning-snapshot-payload'
import type { LightningPayment } from '@/lib/lightning-backend-service'

function samplePayment(overrides: Partial<LightningPayment> = {}): LightningPayment {
  return {
    paymentHash: 'h',
    pending: false,
    amountSats: 1,
    memo: '',
    timestamp: 100,
    bolt11: 'lnbc',
    direction: 'incoming',
    feesPaidSats: 0,
    ...overrides,
  }
}

describe('lightning-snapshot-payload', () => {
  it('capLightningPaymentsForSnapshot keeps newest by timestamp', () => {
    const many = Array.from({ length: MAX_STORED_LIGHTNING_PAYMENTS + 10 }, (_, i) =>
      samplePayment({ paymentHash: `p${i}`, timestamp: i }),
    )
    const capped = capLightningPaymentsForSnapshot(many)
    expect(capped).toHaveLength(MAX_STORED_LIGHTNING_PAYMENTS)
    const timestamps = capped.map((p) => p.timestamp)
    expect(Math.min(...timestamps)).toBe(10)
    expect(Math.max(...timestamps)).toBe(MAX_STORED_LIGHTNING_PAYMENTS + 9)
  })

  it('isLightningPaymentPayload rejects partial objects', () => {
    expect(isLightningPaymentPayload({})).toBe(false)
    expect(isLightningPaymentPayload(samplePayment())).toBe(true)
  })

  it('parseLightningPaymentsFromJson filters invalid rows', () => {
    expect(parseLightningPaymentsFromJson('')).toEqual([])
    expect(parseLightningPaymentsFromJson('[{"x":1}]')).toEqual([])
    expect(
      parseLightningPaymentsFromJson(JSON.stringify([samplePayment()])),
    ).toHaveLength(1)
  })
})
