export type LockLifecyclePhase =
  | 'no-lock'
  | 'locked'
  | 'locking'
  | 'unlocking'
  | 'unlocked'

export type LockLifecycleOperation =
  | 'none'
  | 'locking'
  | 'manual_unlock'
  | 'bootstrap_unlock'

export type LockLifecycleSnapshot = {
  phase: LockLifecyclePhase
  operation: LockLifecycleOperation
}
