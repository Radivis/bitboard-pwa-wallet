import { describe, expect, it } from 'vitest'
import { formatArkadeVtxoExpiryIndicator } from '@/lib/arkade/arkade-vtxo-expiry-display'

describe('formatArkadeVtxoExpiryIndicator', () => {
  it('returns null when no earliest expiry', () => {
    expect(
      formatArkadeVtxoExpiryIndicator({
        earliestExpiresAt: null,
        expiringSoonCount: 0,
      }),
    ).toBeNull()
  })

  it('formats primary text and renewal suffix when expiring soon', () => {
    const inThreeDays = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3
    const result = formatArkadeVtxoExpiryIndicator({
      earliestExpiresAt: inThreeDays,
      expiringSoonCount: 2,
    })

    expect(result).not.toBeNull()
    expect(result?.primary).toMatch(/^Earliest VTXO expiry /)
    expect(result?.renewalSoonSuffix).toBe('2 need renewal soon')
  })
})
