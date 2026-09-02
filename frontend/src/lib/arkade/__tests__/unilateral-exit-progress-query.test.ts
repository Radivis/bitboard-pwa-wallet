import { describe, expect, it } from 'vitest'
import {
  unilateralExitProgressQueryRefetchInterval,
  unilateralExitProgressQueryShouldFetch,
} from '@/lib/arkade/unilateral-exit-progress-query'

const progressPollMs = 3_000
const progressIdlePollMs = 15_000

describe('unilateralExitProgressQueryRefetchInterval', () => {
  it('is false while the job is active', () => {
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: true,
        unilateralExitJobActive: true,
        branchComplete: false,
        waitingForConfirmation: true,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(false)
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: true,
        unilateralExitJobActive: true,
        branchComplete: false,
        waitingForConfirmation: false,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(false)
  })

  it('is false when the branch is complete', () => {
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: true,
        unilateralExitJobActive: false,
        branchComplete: true,
        waitingForConfirmation: true,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(false)
  })

  it('uses wait/idle polls only when the job is not active', () => {
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: true,
        unilateralExitJobActive: false,
        branchComplete: false,
        waitingForConfirmation: true,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(progressPollMs)
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: true,
        unilateralExitJobActive: false,
        branchComplete: false,
        waitingForConfirmation: false,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(progressIdlePollMs)
    expect(
      unilateralExitProgressQueryRefetchInterval({
        enabled: false,
        unilateralExitJobActive: false,
        branchComplete: false,
        waitingForConfirmation: true,
        progressPollMs,
        progressIdlePollMs,
      }),
    ).toBe(false)
  })
})

describe('unilateralExitProgressQueryShouldFetch', () => {
  it('does not fetch while the job is active', () => {
    expect(
      unilateralExitProgressQueryShouldFetch({
        enabled: true,
        unilateralExitJobActive: true,
      }),
    ).toBe(false)
    expect(
      unilateralExitProgressQueryShouldFetch({
        enabled: true,
        unilateralExitJobActive: false,
      }),
    ).toBe(true)
  })
})
