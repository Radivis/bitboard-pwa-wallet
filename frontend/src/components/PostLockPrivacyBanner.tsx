import { useState } from 'react'
import { DesignBanner } from '@/components/design/DesignBanner'
import { WalletUnlock } from '@/components/WalletUnlock'
import { usePostLockWalletReturn } from '@/hooks/usePostLockWalletReturn'
import { useWallet } from '@/db'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Shown on start after locking from a wallet route: explains the privacy redirect
 * and offers returning to the prior wallet screen after unlock.
 */
export function PostLockPrivacyBanner() {
  const [returnUnlockOpen, setReturnUnlockOpen] = useState(false)
  const privacyRedirect = usePostLockPrivacyRedirectStore(
    (postLockPrivacyRedirectState) => postLockPrivacyRedirectState.privacyRedirect,
  )
  const dismiss = usePostLockPrivacyRedirectStore(
    (postLockPrivacyRedirectState) => postLockPrivacyRedirectState.dismissPrivacyRedirectBanner,
  )
  const { finishReturnAfterUnlock, returnWithoutPassword } = usePostLockWalletReturn()
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const { data: activeWalletRow, isSuccess: walletRowLoaded } =
    useWallet(activeWalletId)
  const walletDisplayName =
    walletRowLoaded && activeWalletRow?.name ? activeWalletRow.name : undefined

  if (privacyRedirect === null || walletStatus === 'unlocked') return null

  const handleUnlockAndReturn = () => {
    if (returnWithoutPassword()) return
    setReturnUnlockOpen(true)
  }

  const handleUnlockSuccess = () => {
    setReturnUnlockOpen(false)
    finishReturnAfterUnlock()
  }

  return (
    <>
      <DesignBanner
        role="region"
        aria-label="Wallet lock privacy notice"
        status="info"
        className="mb-6 w-full"
        title="Wallet locked — moved to start for privacy"
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
          onUnlockSuccess={handleUnlockSuccess}
        />
      ) : null}
    </>
  )
}
