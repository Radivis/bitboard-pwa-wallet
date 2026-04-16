import { useEffect } from 'react'
import { bumpAutoLockTimer } from '@/stores/sessionStore'

const ACTIVITY_OPTIONS: AddEventListenerOptions = { capture: true }

/**
 * Extends the wallet auto-lock idle window on pointer and keyboard input.
 */
export function useAutoLockActivityBumps() {
  useEffect(() => {
    const onActivity = () => {
      bumpAutoLockTimer()
    }
    window.addEventListener('pointerdown', onActivity, ACTIVITY_OPTIONS)
    window.addEventListener('keydown', onActivity, ACTIVITY_OPTIONS)
    return () => {
      window.removeEventListener('pointerdown', onActivity, ACTIVITY_OPTIONS)
      window.removeEventListener('keydown', onActivity, ACTIVITY_OPTIONS)
    }
  }, [])
}
