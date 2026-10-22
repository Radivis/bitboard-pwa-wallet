import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DesignBanner } from '@/components/design/DesignBanner'
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
  const privacyRedirect = usePostLockPrivacyRedirectStore((postLockPrivacyRedirectState) => postLockPrivacyRedirectState.privacyRedirect)
  const dismiss = usePostLockPrivacyRedirectStore(
    (postLockPrivacyRedirectState) => postLockPrivacyRedirectState.dismissPrivacyRedirectBanner,
  )
  const nearZeroActive = useNearZeroSecurityStore((nearZeroSecurityState) => nearZeroSecurityState.active)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
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
      <DesignBanner
        role="region"
        aria-label="Wallet lock privacy notice"
        status="info"
        className="mb-6"
        title="Wallet locked — moved to Library for privacy"
        description="You left the wallet area so balances and activity are not visible on screen. You can dismiss this note or unlock and return to where you were."
        primaryAction={{
          label: 'Unlock wallet and go to previous page',
          onClick: handleUnlockAndReturn,
        }}
        secondaryAction={{
          label: 'Dismiss',
          onClick: () => dismiss(),
        }}
      />
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
