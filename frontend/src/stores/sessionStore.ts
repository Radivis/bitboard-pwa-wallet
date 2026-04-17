import { create } from 'zustand'

const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000

interface SessionState {
  password: string | null
  setPassword: (pw: string | null) => void
  clear: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  password: null,
  setPassword: (password) => set({ password }),
  /**
   * Clears the session password. Only the reference is set to null; the previous
   * string may remain in memory until GC (JavaScript strings are immutable, so
   * we cannot overwrite the backing memory). Call after lock to reduce exposure.
   */
  clear: () => set({ password: null }),
}))

let autoLockTimer: ReturnType<typeof setTimeout> | null = null
let lastAutoLockHandler: (() => void | Promise<void>) | null = null

export function startAutoLockTimer(onLock: () => void | Promise<void>) {
  resetAutoLockTimer(onLock)
}

export function resetAutoLockTimer(onLock: () => void | Promise<void>) {
  lastAutoLockHandler = onLock
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }
  autoLockTimer = setTimeout(() => {
    void (async () => {
      try {
        await Promise.resolve(onLock())
      } catch (err) {
        console.error('[session] auto-lock handler failed', err)
      } finally {
        useSessionStore.getState().clear()
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
