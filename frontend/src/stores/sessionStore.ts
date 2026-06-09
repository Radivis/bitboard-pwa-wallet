import { create } from 'zustand'

const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000

interface SessionState {
  /** @deprecated Password lives in encryption worker secrets session only. */
  clear: () => void
}

export const useSessionStore = create<SessionState>()(() => ({
  clear: () => {
    // Lock path calls endWalletSecretsSession() in cryptoStore.
  },
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
