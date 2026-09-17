import { Outlet } from '@tanstack/react-router'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { useWalletStore } from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'

/**
 * Wallet-UI operation: blocks `/wallet/*` until the active wallet is unlocked or
 * bootstrapping. That is one secrets-session requirement, not a blanket restore
 * for the whole app. Settings and Lab use {@link useRequireUnlockedWallet} for
 * other operations that need WASM or secrets.
 */
export function WalletRouteSecretsGate() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

  if (activeWalletId != null && !walletIsUnlockedOrSyncing(walletStatus)) {
    return <WalletUnlockOrNearZeroLoading />
  }

  return <Outlet />
}
