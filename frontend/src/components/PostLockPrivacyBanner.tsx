import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useWallet } from '@/db'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Shown on Library after locking from a wallet route: explains the privacy redirect
 * and offers returning to the prior wallet screen after unlock.
 */
export function PostLockPrivacyBanner() {
  const navigate = useNavigate()
  const [returnUnlockOpen, setReturnUnlockOpen] = useState(false)
  const privacyRedirect = usePostLockPrivacyRedirectStore((s) => s.privacyRedirect)
  const dismiss = usePostLockPrivacyRedirectStore(
    (s) => s.dismissPrivacyRedirectBanner,
  )
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const { data: activeWalletRow, isSuccess: walletRowLoaded } =
    useWallet(activeWalletId)
  const walletDisplayName =
    walletRowLoaded && activeWalletRow?.name ? activeWalletRow.name : undefined

  if (privacyRedirect === null) return null

  const { returnPath } = privacyRedirect

  const finishReturnAfterUnlock = () => {
    setReturnUnlockOpen(false)
    dismiss()
    void navigate({ to: returnPath, replace: true })
  }

  const handleUnlockAndReturn = () => {
    if (nearZeroActive) {
      dismiss()
      void navigate({ to: returnPath, replace: true })
      return
    }
    setReturnUnlockOpen(true)
  }

  return (
    <>
      <div
        role="region"
        aria-label="Wallet lock privacy notice"
        className="mb-6 rounded-lg border border-sky-800/60 bg-sky-950/40 px-4 py-4 text-sky-50 shadow-sm dark:border-sky-700/50 dark:bg-sky-950/60"
      >
        <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 gap-3">
            <Lock
              className="mt-0.5 h-5 w-5 shrink-0 text-sky-200"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold leading-snug text-sky-100">
                Wallet locked — moved to Library for privacy
              </p>
              <p className="text-sm leading-relaxed text-sky-100/90">
                You left the wallet area so balances and activity are not visible on screen.
                You can dismiss this note or unlock and return to where you were.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
            <Button
              type="button"
              variant="secondary"
              className="border-sky-700/80 bg-sky-900/50 text-sky-50 hover:bg-sky-900/70"
              onClick={() => dismiss()}
            >
              Dismiss
            </Button>
            <Button type="button" onClick={handleUnlockAndReturn}>
              Unlock wallet and go to previous page
            </Button>
          </div>
        </div>
      </div>
      {returnUnlockOpen ? (
        <WalletUnlock
          walletName={walletDisplayName}
          onDismiss={() => setReturnUnlockOpen(false)}
          onUnlockSuccess={finishReturnAfterUnlock}
        />
      ) : null}
    </>
  )
}
