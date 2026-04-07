import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useWalletStore } from '@/stores/walletStore'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'

type WalletUnlockOrNearZeroLoadingProps = {
  walletName?: string
  variant?: 'default' | 'setup'
  onDismiss?: () => void
  onUnlockSuccess?: () => void
}

/**
 * After lock in near-zero mode, the session is cleared and then restored from SQLite
 * while WASM reloads. During that window the wallet is "locked" but the user must
 * not see the password dialog — show a spinner until auto-restore finishes or fails.
 */
export function WalletUnlockOrNearZeroLoading(
  props: WalletUnlockOrNearZeroLoadingProps,
) {
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const { isError, isFetching, isPending, refetch } = useActiveWalletLoadQuery()

  const walletStillGated =
    walletStatus !== 'unlocked' && walletStatus !== 'syncing'

  /**
   * Near-zero mode uses an auto-restored session, not a user-typed password. Never show
   * the standard unlock dialog while still gated: spinner, then retry if bootstrap fails.
   * (Bootstrap also waits for the crypto worker to finish its health check after lock.)
   */
  if (nearZeroActive && walletStillGated) {
    if (isError && !isFetching && !isPending) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Bitboard could not finish unlocking automatically. This can happen right after
            locking; try again or reload the page.
          </p>
          <Button type="button" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )
    }
    return <LoadingSpinner text="Unlocking wallet…" />
  }

  return <WalletUnlock {...props} />
}
