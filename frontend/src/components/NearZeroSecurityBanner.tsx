import { useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpgradeFromNearZeroPasswordModal } from '@/components/UpgradeFromNearZeroPasswordModal'
import { useSessionStore } from '@/stores/sessionStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'

const SESSION_DISMISS_KEY = 'bitboard_near_zero_banner_dismissed'

function readDismissedFromSessionStorage(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
}

/**
 * Prominent warning while the app uses near-zero security mode; CTA to set a real password.
 */
export function NearZeroSecurityBanner() {
  const location = useLocation()
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const sessionPassword = useSessionStore((s) => s.password)
  const [dismissed, setDismissed] = useState(readDismissedFromSessionStorage)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  if (location.pathname.startsWith('/setup')) {
    return null
  }

  if (!nearZeroActive || !sessionPassword) {
    return null
  }

  if (dismissed) {
    return null
  }

  const handleDismissLater = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <>
      <div
        role="alert"
        className="border-b border-red-900/80 bg-red-600 px-4 py-4 text-red-50 shadow-md dark:bg-red-950 dark:text-red-50"
      >
        <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 gap-3">
            <AlertTriangle
              className="mt-0.5 h-7 w-7 shrink-0 text-red-100"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <p className="text-base font-semibold leading-snug">
                Near-zero security mode is active
              </p>
              <p className="text-sm leading-relaxed text-red-100">
                Your wallets are protected only by a published wrapper key—treat this as unsafe.
                Set a real app password now.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="button"
              variant="secondary"
              className="bg-white text-red-900 hover:bg-red-50 dark:bg-red-100 dark:hover:bg-white"
              onClick={() => setUpgradeOpen(true)}
            >
              Set up password now
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto py-1 text-xs text-red-100 hover:bg-red-700/50 hover:text-white"
              onClick={handleDismissLater}
            >
              Set up a password later
            </Button>
          </div>
        </div>
      </div>

      <UpgradeFromNearZeroPasswordModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
      />
    </>
  )
}
