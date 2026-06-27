import { describe, expect, it } from 'vitest'
import { shouldSkipRailLifecycleResetForLockPhase } from '@/lib/wallet/lifecycle/rail-lifecycle-lock-phase'

describe('shouldSkipRailLifecycleResetForLockPhase', () => {
  it('skips during unlock phases', () => {
    expect(shouldSkipRailLifecycleResetForLockPhase('unlocking', false)).toBe(true)
    expect(shouldSkipRailLifecycleResetForLockPhase('unlocked', false)).toBe(true)
  })

  it('skips when lifecycle work is in flight', () => {
    expect(shouldSkipRailLifecycleResetForLockPhase('locked', true)).toBe(true)
    expect(shouldSkipRailLifecycleResetForLockPhase('locking', true)).toBe(true)
  })

  it('allows reset when locking or locked without in-flight work', () => {
    expect(shouldSkipRailLifecycleResetForLockPhase('locking', false)).toBe(false)
    expect(shouldSkipRailLifecycleResetForLockPhase('locked', false)).toBe(false)
    expect(shouldSkipRailLifecycleResetForLockPhase('no-lock', false)).toBe(false)
  })
})
