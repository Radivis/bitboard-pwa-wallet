import { useNavigate, useSearch } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useWalletStore } from '@/stores/walletStore'
import { useFeatureStore } from '@/stores/featureStore'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { WalletManagement } from '@/components/wallet/WalletManagement'
import { SeedPhraseBackup } from '@/components/wallet/SeedPhraseBackup'
import { LightningWallets } from '@/components/wallet/LightningWallets'
import { ArkadePanel } from '@/components/wallet/ArkadePanel'

export function ManagementPage() {
  const navigate = useNavigate({ from: '/wallet/management' })
  const { openDelete } = useSearch({ from: '/wallet/management' })
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isArkadeEnabled = useFeatureStore((featureState) => featureState.isArkadeEnabled)
  const showLightningWallets = isLightningEnabled && isLightningSupported(networkMode)
  const showArkadePanel = isArkadeEnabled

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
          {showArkadePanel && <ArkadePanel />}
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
