import { useNavigate, useSearch } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useWalletStore } from '@/stores/walletStore'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning-utils'
import { WalletManagement } from '@/components/wallet/WalletManagement'
import { SeedPhraseBackup } from '@/components/wallet/SeedPhraseBackup'
import { LightningWallets } from '@/components/wallet/LightningWallets'

export function ManagementPage() {
  const navigate = useNavigate({ from: '/wallet/management' })
  const { openDelete } = useSearch({ from: '/wallet/management' })
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const showLightningWallets = lightningEnabled && isLightningSupported(networkMode)

  return (
    <div className="space-y-6">
      <PageHeader title="Management" icon={SlidersHorizontal} />

      {activeWalletId ? (
        <>
          <WalletManagement
            deleteWalletAutoOpen={openDelete === true}
            onDeleteWalletAutoOpenConsumed={() =>
              navigate({
                search: (prev) => ({ ...prev, openDelete: undefined }),
                replace: true,
              })
            }
          />
          <SeedPhraseBackup />
          {showLightningWallets && <LightningWallets />}
        </>
      ) : (
        <p className="text-muted-foreground">
          Create or import a wallet to manage lock, backup, and multiple wallets.
        </p>
      )}
    </div>
  )
}
