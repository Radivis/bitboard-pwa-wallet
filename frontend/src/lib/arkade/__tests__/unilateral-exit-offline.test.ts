import { describe, expect, it } from 'vitest'
import {
  shouldSkipBackgroundOperatorSyncWhenAutonomous,
  shouldSyncOperatorAfterUnilateralExitOperation,
} from '@/lib/arkade/unilateral-exit-offline'

describe('unilateral-exit-offline', () => {
  it('shouldSyncOperatorAfterUnilateralExitOperation is false', () => {
    expect(shouldSyncOperatorAfterUnilateralExitOperation()).toBe(false)
  })

  it('skips dashboard poll only while autonomous mode is active', () => {
    expect(shouldSkipBackgroundOperatorSyncWhenAutonomous(false)).toBe(false)
    expect(shouldSkipBackgroundOperatorSyncWhenAutonomous(true)).toBe(true)
  })
})
