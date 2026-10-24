import { useState, useLayoutEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { DesignBanner } from '@/components/design/DesignBanner'
import { UpgradeFromNearZeroPasswordModal } from '@/components/UpgradeFromNearZeroPasswordModal'
import { useWalletStore } from '@/stores/walletStore'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

/** Exported for tests; session dismiss is cleared on each visit to `/wallet/receive`. */
export const NEAR_ZERO_BANNER_SESSION_DISMISS_KEY = 'bitboard_near_zero_banner_dismissed'

function readDismissedFromSessionStorage(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(NEAR_ZERO_BANNER_SESSION_DISMISS_KEY) === '1'
}

/**
 * Prominent warning while the app uses near-zero security mode; CTA to set a real password.
 */
export function NearZeroSecurityBanner() {
  const location = useLocation()
  const nearZeroActive = useNearZeroSecurityStore((nearZeroSecurityState) => nearZeroSecurityState.active)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const [dismissed, setDismissed] = useState(readDismissedFromSessionStorage)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  useLayoutEffect(() => {
    if (location.pathname !== '/wallet/receive') return
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.removeItem(NEAR_ZERO_BANNER_SESSION_DISMISS_KEY)
    setDismissed(false)
  }, [location.pathname])

  if (location.pathname.startsWith('/setup')) {
    return null
  }

  if (!nearZeroActive || !walletIsUnlockedOrSyncing(walletStatus)) {
    return null
  }

  if (dismissed) {
    return null
  }

  const handleDismissLater = () => {
    sessionStorage.setItem(NEAR_ZERO_BANNER_SESSION_DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <>
      <DesignBanner
        role="alert"
        status="risk"
        className="mx-4 mt-4"
        title="Near-zero security mode is active"
        description="Your wallets are protected only by a published wrapper key—treat this as unsafe. Set a real app password now."
        primaryAction={{
          label: 'Set up password now',
          onClick: () => setUpgradeOpen(true),
        }}
        secondaryAction={{
          label: 'Set up a password later',
          onClick: handleDismissLater,
        }}
      />

      <UpgradeFromNearZeroPasswordModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
      />
    </>
  )
}
