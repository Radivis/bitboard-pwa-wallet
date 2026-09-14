import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000

/** Legacy compatibility shim; intentionally does nothing. */
export function clearLegacySessionState(): void {
  // Worker/session cleanup happens in cryptoStore lock/teardown paths.
}

let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoLockHandler: (() => void | Promise<void>) | null = null

function idleAutoLockIsSuppressedByNearZero(): boolean {
  return useNearZeroSecurityStore.getState().active
}

export function startAutoLockTimer(onLock: () => void | Promise<void>) {
  resetAutoLockTimer(onLock)
}

export function resetAutoLockTimer(onLock: () => void | Promise<void>) {
  // Near-zero restore re-opens the session without a user password, so idle
  // auto-lock only adds churn. Manual lock remains available.
  if (idleAutoLockIsSuppressedByNearZero()) {
    clearAutoLockTimer()
    return
  }
  lastAutoLockHandler = onLock
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }
  autoLockTimer = setTimeout(() => {
    if (idleAutoLockIsSuppressedByNearZero()) {
      clearAutoLockTimer()
      return
    }
    void (async () => {
      try {
        await Promise.resolve(onLock())
      } catch (err) {
        console.error('[session] auto-lock handler failed', err)
      } finally {
        clearLegacySessionState()
      }
    })()
  }, AUTO_LOCK_TIMEOUT_MS)
}

/** Reschedules the idle auto-lock from now; no-op when no timer is active (e.g. locked). */
export function bumpAutoLockTimer() {
  if (lastAutoLockHandler === null) return
  resetAutoLockTimer(lastAutoLockHandler)
}

export function clearAutoLockTimer() {
  lastAutoLockHandler = null
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}

useNearZeroSecurityStore.subscribe((nearZeroSecurityState) => {
  if (nearZeroSecurityState.active) {
    clearAutoLockTimer()
  }
})
