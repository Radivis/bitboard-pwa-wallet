import { describe, expect, it } from 'vitest'
import {
  formatUnilateralExitVtxoExpiryRemaining,
  hostTxVtxoExpiryUrgency,
  unilateralExitTreeNodeExpiryFillClass,
} from '@/lib/arkade/unilateral-exit-vtxo-expiry'

const NOW_SECONDS = 1_789_200_000
const DAY_SECONDS = 86_400

describe('formatUnilateralExitVtxoExpiryRemaining', () => {
  it('formatUnilateralExitVtxoExpiryRemaining_returns_null_when_expires_at_missing', () => {
    expect(formatUnilateralExitVtxoExpiryRemaining(0, NOW_SECONDS)).toBeNull()
    expect(formatUnilateralExitVtxoExpiryRemaining(-1, NOW_SECONDS)).toBeNull()
    expect(formatUnilateralExitVtxoExpiryRemaining(null, NOW_SECONDS)).toBeNull()
    expect(formatUnilateralExitVtxoExpiryRemaining(undefined, NOW_SECONDS)).toBeNull()
  })

  it('formatUnilateralExitVtxoExpiryRemaining_returns_expired_when_past', () => {
    expect(formatUnilateralExitVtxoExpiryRemaining(NOW_SECONDS - 1, NOW_SECONDS)).toBe(
      'expired',
    )
    expect(formatUnilateralExitVtxoExpiryRemaining(NOW_SECONDS, NOW_SECONDS)).toBe(
      'expired',
    )
  })

  it('formatUnilateralExitVtxoExpiryRemaining_less_than_one_day', () => {
    expect(
      formatUnilateralExitVtxoExpiryRemaining(NOW_SECONDS + DAY_SECONDS - 1, NOW_SECONDS),
    ).toBe('expires in less than 1 day')
  })

  it('formatUnilateralExitVtxoExpiryRemaining_one_day', () => {
    expect(
      formatUnilateralExitVtxoExpiryRemaining(NOW_SECONDS + DAY_SECONDS, NOW_SECONDS),
    ).toBe('expires in 1 day')
  })

  it('formatUnilateralExitVtxoExpiryRemaining_n_days', () => {
    expect(
      formatUnilateralExitVtxoExpiryRemaining(NOW_SECONDS + DAY_SECONDS * 5, NOW_SECONDS),
    ).toBe('expires in 5 days')
    expect(
      formatUnilateralExitVtxoExpiryRemaining(
        NOW_SECONDS + DAY_SECONDS * 5 + DAY_SECONDS - 1,
        NOW_SECONDS,
      ),
    ).toBe('expires in 5 days')
  })
})

describe('hostTxVtxoExpiryUrgency', () => {
  it('hostTxVtxoExpiryUrgency_returns_null_when_all_far', () => {
    expect(
      hostTxVtxoExpiryUrgency(
        [{ expiresAt: NOW_SECONDS + DAY_SECONDS * 3 }, { expiresAt: NOW_SECONDS + DAY_SECONDS * 10 }],
        NOW_SECONDS,
      ),
    ).toBeNull()
  })

  it('hostTxVtxoExpiryUrgency_returns_warning_when_any_within_3_days', () => {
    expect(
      hostTxVtxoExpiryUrgency(
        [{ expiresAt: NOW_SECONDS + DAY_SECONDS * 3 - 1 }],
        NOW_SECONDS,
      ),
    ).toBe('warning')
  })

  it('hostTxVtxoExpiryUrgency_returns_expired_when_any_expired', () => {
    expect(
      hostTxVtxoExpiryUrgency([{ expiresAt: NOW_SECONDS - 1 }], NOW_SECONDS),
    ).toBe('expired')
  })

  it('hostTxVtxoExpiryUrgency_expired_wins_over_warning', () => {
    expect(
      hostTxVtxoExpiryUrgency(
        [
          { expiresAt: NOW_SECONDS + DAY_SECONDS },
          { expiresAt: NOW_SECONDS - 60 },
        ],
        NOW_SECONDS,
      ),
    ).toBe('expired')
  })

  it('hostTxVtxoExpiryUrgency_ignores_non_positive_expires_at', () => {
    expect(
      hostTxVtxoExpiryUrgency(
        [{ expiresAt: 0 }, { expiresAt: -5 }, { expiresAt: NOW_SECONDS + DAY_SECONDS * 10 }],
        NOW_SECONDS,
      ),
    ).toBeNull()
  })
})

describe('unilateralExitTreeNodeExpiryFillClass', () => {
  it('unilateralExitTreeNodeExpiryFillClass_maps_urgency', () => {
    expect(unilateralExitTreeNodeExpiryFillClass('expired')).toBe(
      'bg-red-900 text-red-50',
    )
    expect(unilateralExitTreeNodeExpiryFillClass('warning')).toBe(
      'bg-yellow-800 text-yellow-50',
    )
    expect(unilateralExitTreeNodeExpiryFillClass(null)).toBeUndefined()
  })
})
