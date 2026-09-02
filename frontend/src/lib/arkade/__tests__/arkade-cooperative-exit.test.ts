import { describe, expect, it } from 'vitest'
import {
  ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
  arkadeCooperativeExitSpendableSats,
  formatCollaborativeExitEstimateError,
  isCollaborativeExitInsufficientFundsError,
  isSignerRotationCooperativeExitBlocked,
} from '@/lib/arkade/arkade-cooperative-exit'

describe('arkade-cooperative-exit', () => {
  it('blocks cooperative exit when signer rotation is expired', () => {
    expect(
      isSignerRotationCooperativeExitBlocked({
        previousSignerPkHex: 'aa',
        deprecatedStatus: 'expired',
        cutoffUnix: 1,
      }),
    ).toBe(true)
    expect(
      isSignerRotationCooperativeExitBlocked({
        previousSignerPkHex: 'aa',
        deprecatedStatus: 'migratable',
        cutoffUnix: 1,
      }),
    ).toBe(false)
  })

  it('detects insufficient cooperative inputs from structured estimate error code', () => {
    const estimate = {
      estimateErrorCode: ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
      estimateError: 'cannot afford to send 0.00050000 BTC, only have 0 BTC',
    }
    expect(isCollaborativeExitInsufficientFundsError(estimate)).toBe(true)
    expect(formatCollaborativeExitEstimateError(estimate)).toMatch(/unilateral exit/i)
  })

  it('passes through unrelated fee estimate errors', () => {
    const estimate = {
      estimateError: 'failed to convert between types: missing fee',
    }
    expect(isCollaborativeExitInsufficientFundsError(estimate)).toBe(false)
    expect(formatCollaborativeExitEstimateError(estimate)).toBe(estimate.estimateError)
  })

  it('cooperative exit spendable is zero when fee estimate reports insufficient inputs', () => {
    const balance = { confirmedSats: 50_000, offchainSpendableSats: 0, totalSats: 50_000 }
    expect(
      arkadeCooperativeExitSpendableSats(balance, {
        estimateErrorCode: ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
      }),
    ).toBe(0)
  })

  it('cooperative exit spendable uses offchain bucket not bumper-inclusive confirmed', () => {
    const balance = {
      confirmedSats: 50_000,
      offchainSpendableSats: 0,
      totalSats: 50_000,
      pendingRecoveryDueToExpiredSignerSats: 50_000,
    }
    expect(arkadeCooperativeExitSpendableSats(balance, null)).toBe(0)
  })
})
