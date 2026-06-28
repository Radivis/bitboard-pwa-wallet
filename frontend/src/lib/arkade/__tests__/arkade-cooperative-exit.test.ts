import { describe, expect, it } from 'vitest'
import {
  ARKADE_COLLABORATIVE_EXIT_ESTIMATE_ERROR_INSUFFICIENT_COOPERATIVE_INPUTS,
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
})
