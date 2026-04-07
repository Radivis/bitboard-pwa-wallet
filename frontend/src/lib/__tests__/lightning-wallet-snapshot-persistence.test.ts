import { describe, expect, it } from 'vitest'
import type { LightningPayment } from '@/lib/lightning-backend-service'
import { mergeNwcConnectionSnapshot } from '@/lib/lightning-wallet-snapshot-persistence'

function pay(overrides: Partial<LightningPayment> = {}): LightningPayment {
  return {
    paymentHash: 'h1',
    pending: false,
    amountSats: 10,
    memo: 'm',
    timestamp: 1,
    bolt11: 'lnbc1',
    direction: 'incoming',
    feesPaidSats: 0,
    ...overrides,
  }
}

describe('mergeNwcConnectionSnapshot', () => {
  it('applies balance-only on empty prev with empty payments', () => {
    const t = '2020-01-01T00:00:00.000Z'
    const m = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 99, balanceUpdatedAt: t },
    })
    expect(m.balanceSats).toBe(99)
    expect(m.balanceUpdatedAt).toBe(t)
    expect(m.payments).toEqual([])
    expect(m.paymentsUpdatedAt).toBe(t)
  })

  it('preserves balance when patching payments only', () => {
    const prev = mergeNwcConnectionSnapshot(undefined, {
      balance: { balanceSats: 50, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' },
    })
    const t2 = '2020-01-02T00:00:00.000Z'
    const next = mergeNwcConnectionSnapshot(prev, {
      payments: { payments: [pay()], paymentsUpdatedAt: t2 },
    })
    expect(next.balanceSats).toBe(50)
    expect(next.payments).toHaveLength(1)
    expect(next.paymentsUpdatedAt).toBe(t2)
  })

  it('preserves payments when patching balance only', () => {
    const t0 = '2020-01-01T00:00:00.000Z'
    const prev = mergeNwcConnectionSnapshot(undefined, {
      payments: { payments: [pay()], paymentsUpdatedAt: t0 },
    })
    const t1 = '2020-01-03T00:00:00.000Z'
    const next = mergeNwcConnectionSnapshot(prev, {
      balance: { balanceSats: 7, balanceUpdatedAt: t1 },
    })
    expect(next.balanceSats).toBe(7)
    expect(next.payments).toHaveLength(1)
    expect(next.paymentsUpdatedAt).toBe(t0)
  })
})
