import { describe, expect, it } from 'vitest'
import {
  arkadeDashboardSpendableSats,
  arkadeOffchainSpendableSats,
  arkadeOnchainBumperSats,
  arkadePendingRecoverySats,
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

  it('uses net confirmedSats from wasm for dashboard headline', () => {
    const balance = {
      confirmedSats: 19_397,
      totalSats: 19_397,
      unilateralExitInProgressSats: 180_603,
      collaborativeExitInProgressSats: 0,
    }
    expect(arkadeDashboardSpendableSats(balance)).toBe(19_397)
  })

  it('exposes pending recovery sats from wasm balance payload', () => {
    const balance = {
      confirmedSats: 0,
      totalSats: 50_000,
      pendingRecoverySats: 50_000,
    }
    expect(arkadePendingRecoverySats(balance)).toBe(50_000)
    expect(arkadeDashboardSpendableSats(balance)).toBe(0)
  })

  it('dashboard headline excludes bumper when offchain is zero', () => {
    const balance = {
      confirmedSats: 50_000,
      offchainSpendableSats: 0,
      onchainBumperSats: 50_000,
      totalSats: 50_000,
    }
    expect(arkadeDashboardSpendableSats(balance)).toBe(0)
    expect(arkadeOnchainBumperSats(balance)).toBe(50_000)
  })

  it('arkadeOnchainBumperSats derives from confirmed minus offchain on legacy wasm', () => {
    const balance = {
      confirmedSats: 52_000,
      offchainSpendableSats: 2_000,
      totalSats: 52_000,
    }
    expect(arkadeOnchainBumperSats(balance)).toBe(50_000)
  })

  it('offchain spendable excludes bumper included in confirmedSats', () => {
    const balance = {
      confirmedSats: 50_000,
      offchainSpendableSats: 0,
      totalSats: 50_000,
    }
    expect(arkadeOffchainSpendableSats(balance)).toBe(0)
  })
})
