import { Outlet } from '@tanstack/react-router'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

/**
 * Blocks every `/wallet/*` route until the active wallet session is unlocked or bootstrapping.
 * Settings and other non-wallet routes use {@link useRequireUnlockedWallet} for inline unlock.
 */
export function WalletRouteSecretsGate() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

  if (activeWalletId != null && !walletIsUnlockedOrSyncing(walletStatus)) {
    return <WalletUnlockOrNearZeroLoading />
  }

  return <Outlet />
}
