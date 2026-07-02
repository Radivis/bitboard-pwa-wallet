import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'

/** Skip rail snapshot reset while unlock is in progress or lifecycle work is still in flight. */
export function shouldSkipRailLifecycleResetForLockPhase(
  lockPhase: LockLifecyclePhase,
  hasInFlightLifecycleWork: boolean,
): boolean {
  return (
    lockPhase === 'unlocking' ||
    lockPhase === 'unlocked' ||
    hasInFlightLifecycleWork
  )
}
