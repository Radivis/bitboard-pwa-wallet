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
import { BarkPanel } from '@/components/wallet/BarkPanel'

export function ManagementPage() {
  const navigate = useNavigate({ from: '/wallet/management' })
  const { openDelete } = useSearch({ from: '/wallet/management' })
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isArkadeEnabled = useFeatureStore((featureState) => featureState.isArkadeEnabled)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const showLightningWallets = isLightningEnabled && isLightningSupported(networkMode)
  const showArkadePanel = isArkadeEnabled
  const showBarkPanel = isBarkEnabled

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
          {showBarkPanel && <BarkPanel />}
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
