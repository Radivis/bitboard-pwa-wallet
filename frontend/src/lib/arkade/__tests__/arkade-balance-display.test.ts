import { describe, expect, it } from 'vitest'
import {
  arkadeDashboardSpendableSats,
  arkadeOffchainSpendableSats,
  arkadeOnchainBumperSats,
  arkadePendingRecoveryDueToExpiredSignerSats,
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

  it('uses offchain spendable from wasm for dashboard headline when unilateral exit is in progress', () => {
    // unilateral_exit_in_progress is informational; must not reduce headline spendable.
    const balance = {
      confirmedSats: 200_000,
      offchainSpendableSats: 200_000,
      totalSats: 200_000,
      unilateralExitInProgressSats: 180_603,
      collaborativeExitInProgressSats: 0,
    }
    expect(arkadeDashboardSpendableSats(balance)).toBe(200_000)
  })

  it('exposes pending recovery due to expired signer sats from wasm balance payload', () => {
    const balance = {
      confirmedSats: 0,
      totalSats: 50_000,
      pendingRecoveryDueToExpiredSignerSats: 50_000,
    }
    expect(arkadePendingRecoveryDueToExpiredSignerSats(balance)).toBe(50_000)
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
