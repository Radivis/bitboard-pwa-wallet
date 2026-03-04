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
