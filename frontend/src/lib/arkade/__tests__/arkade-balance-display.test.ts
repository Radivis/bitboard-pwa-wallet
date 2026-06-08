import { describe, expect, it } from 'vitest'
import {
  arkadeDashboardSpendableSats,
  arkadeOffchainSpendableSats,
} from '@/lib/arkade/arkade-balance-display'

describe('arkade-balance-display', () => {
  it('dashboard total adds ready-to-settle boarding to offchain confirmed', () => {
    const balance = {
      confirmedSats: 30_603,
      totalSats: 30_603,
      boardingSpendableSats: 200_000,
      boardingPendingSats: 0,
    }
    expect(arkadeOffchainSpendableSats(balance)).toBe(30_603)
    expect(arkadeDashboardSpendableSats(balance)).toBe(230_603)
  })
})
