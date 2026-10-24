import { useNavigate } from '@tanstack/react-router'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { usePostLockPrivacyRedirectStore } from '@/stores/postLockPrivacyRedirectStore'

/**
 * Shared with the library privacy banner and the header lock control.
 * After a lock from a wallet route, unlocking returns to that route.
 */
export function usePostLockWalletReturn() {
  const navigate = useNavigate()
  const returnPath = usePostLockPrivacyRedirectStore(
    (postLockPrivacyRedirectState) =>
      postLockPrivacyRedirectState.privacyRedirect?.returnPath ?? null,
  )
  const dismissPrivacyRedirect = usePostLockPrivacyRedirectStore(
    (postLockPrivacyRedirectState) => postLockPrivacyRedirectState.dismissPrivacyRedirectBanner,
  )
  const nearZeroActive = useNearZeroSecurityStore(
    (nearZeroSecurityState) => nearZeroSecurityState.active,
  )

  const finishReturnAfterUnlock = () => {
    if (returnPath == null) return
    dismissPrivacyRedirect()
    void navigate({ to: returnPath, replace: true })
  }

  /** Near-zero mode has no password. Returns true when the return already happened. */
  const returnWithoutPassword = () => {
    if (returnPath == null || !nearZeroActive) return false
    finishReturnAfterUnlock()
    return true
  }

  return { returnPath, finishReturnAfterUnlock, returnWithoutPassword }
}
