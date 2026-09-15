import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useWalletStore } from '@/stores/walletStore'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { hydrateNearZeroSessionForWalletRoute } from '@/lib/wallet/near-zero-wallet-hydration'

type WalletUnlockOrNearZeroLoadingProps = {
  walletName?: string
  variant?: 'default' | 'setup'
  onDismiss?: () => void
  onUnlockSuccess?: () => void
}

const NEAR_ZERO_AUTOMATIC_UNLOCK_BOOTSTRAP_FAILED =
  'Bitboard could not finish unlocking automatically. This can happen right after locking; try again or reload the page.'

const NEAR_ZERO_AUTOMATIC_UNLOCK_RESTORE_FAILED =
  "Bitboard could not restore the near-zero session from this device's storage. Try again. If this keeps happening, clear this site's data in your browser settings. That deletes local wallets; recover with your seed phrase or a signed wallet backup."

type NearZeroGatedStatusProps = {
  restoreFailed: boolean
  bootstrapFailed: boolean
  onRetry: () => void
}

function NearZeroGatedFailureNotice({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function NearZeroGatedStatus({
  restoreFailed,
  bootstrapFailed,
  onRetry,
}: NearZeroGatedStatusProps) {
  if (restoreFailed) {
    return (
      <NearZeroGatedFailureNotice
        message={NEAR_ZERO_AUTOMATIC_UNLOCK_RESTORE_FAILED}
        onRetry={onRetry}
      />
    )
  }

  if (bootstrapFailed) {
    return (
      <NearZeroGatedFailureNotice
        message={NEAR_ZERO_AUTOMATIC_UNLOCK_BOOTSTRAP_FAILED}
        onRetry={onRetry}
      />
    )
  }

  return <LoadingSpinner text="Unlocking wallet…" />
}

/**
 * After lock in near-zero mode, the session is cleared and then restored from SQLite
 * while WASM reloads. During that window the wallet is "locked" but the user must
 * not see the password dialog — show a spinner until auto-restore finishes or fails.
 */
export function WalletUnlockOrNearZeroLoading(
  props: WalletUnlockOrNearZeroLoadingProps,
) {
  const queryClient = useQueryClient()
  const nearZeroActive = useNearZeroSecurityStore((nearZeroSecurityState) => nearZeroSecurityState.active)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const { isError, isFetching, isPending, refetch } = useActiveWalletLoadQuery()
  const [nearZeroHydrateRetryCount, setNearZeroHydrateRetryCount] = useState(0)
  const [nearZeroHydrateFinished, setNearZeroHydrateFinished] = useState(false)
  const [nearZeroHydrateRestored, setNearZeroHydrateRestored] = useState(false)

  const walletStillGated = !walletIsUnlockedOrSyncing(walletStatus)

  useEffect(() => {
    if (!walletStillGated) return
    let hydrateCancelled = false
    setNearZeroHydrateFinished(false)
    // SQLite is the source of truth. A stale in-memory flag must not skip restore
    // or leave idle auto-lock armed in near-zero mode.
    void hydrateNearZeroSessionForWalletRoute(queryClient)
      .then((restored) => {
        if (hydrateCancelled) return
        setNearZeroHydrateRestored(restored)
        setNearZeroHydrateFinished(true)
      })
      .catch((hydrateError) => {
        console.error('Near-zero wallet hydration failed:', hydrateError)
        if (hydrateCancelled) return
        setNearZeroHydrateRestored(false)
        setNearZeroHydrateFinished(true)
      })
    return () => {
      hydrateCancelled = true
    }
  }, [walletStillGated, queryClient, nearZeroHydrateRetryCount])

  const retryNearZeroUnlock = () => {
    setNearZeroHydrateRetryCount((retryCount) => retryCount + 1)
    void refetch()
  }

  /**
   * Near-zero mode uses an auto-restored session, not a user-typed password. Never show
   * the standard unlock dialog while still gated: spinner, then retry if restore or
   * bootstrap fails. (Bootstrap also waits for the crypto worker after lock.)
   */
  if (nearZeroActive && walletStillGated) {
    return (
      <NearZeroGatedStatus
        restoreFailed={nearZeroHydrateFinished && !nearZeroHydrateRestored}
        bootstrapFailed={isError && !isFetching && !isPending}
        onRetry={retryNearZeroUnlock}
      />
    )
  }

  return <WalletUnlock {...props} />
}
