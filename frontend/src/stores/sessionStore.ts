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

export function startAutoLockTimer(onLock: () => void) {
  resetAutoLockTimer(onLock)
}

export function resetAutoLockTimer(onLock: () => void) {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
  }
  autoLockTimer = setTimeout(() => {
    useSessionStore.getState().clear()
    onLock()
  }, AUTO_LOCK_TIMEOUT_MS)
}

export function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}
