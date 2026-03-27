import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/PageHeader'
import { useWalletStore } from '@/stores/walletStore'
import { WalletManagement } from '@/components/wallet/WalletManagement'
import { SeedPhraseBackup } from '@/components/wallet/SeedPhraseBackup'

export const Route = createFileRoute('/wallet/management')({
  component: ManagementPage,
})

export function ManagementPage() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)

  return (
    <div className="space-y-6">
      <PageHeader title="Management" />

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
