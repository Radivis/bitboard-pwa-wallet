import { createFileRoute } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { WalletManagement } from '@/components/settings/WalletManagement'
import { SeedPhraseBackup } from '@/components/settings/SeedPhraseBackup'

export const Route = createFileRoute('/wallet/management')({
  component: ManagementPage,
})

export function ManagementPage() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Management</h2>

      {activeWalletId ? (
        <>
          <WalletManagement />
          <SeedPhraseBackup />
        </>
      ) : (
        <p className="text-muted-foreground">
          Create or import a wallet to manage lock, backup, and multiple wallets.
        </p>
      )}
    </div>
  )
}
