import type { ReactNode } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SetAppPasswordModal } from '@/components/SetAppPasswordModal'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useWallets } from '@/db'
import { useSetupAppPasswordGateReady } from '@/hooks/useSetupAppPasswordGateReady'
import { useWalletStore } from '@/stores/walletStore'

/** Loading, unlock, and first-run app-password gate shared by create and import. */
export function SetupNewWalletGate({ children }: { children: ReactNode }) {
  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const { appPasswordReady, walletUnlockedOrSyncing, onAppPasswordSessionStarted } =
    useSetupAppPasswordGateReady(walletStatus)

  if (walletsLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading…" />
      </div>
    )
  }

  const hasWallets = (wallets?.length ?? 0) > 0
  if (hasWallets && !walletUnlockedOrSyncing) {
    return <WalletUnlock variant="setup" />
  }

  if (!hasWallets && !appPasswordReady) {
    return (
      <SetAppPasswordModal
        open
        onSessionStarted={onAppPasswordSessionStarted}
      />
    )
  }

  return children
}
