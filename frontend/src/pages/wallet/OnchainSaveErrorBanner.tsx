import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  acknowledgeArkadeSaveErrorForForcedLock,
  getArkadeSaveLifecycleSnapshot,
  orchestrateArkadeRetrySave,
  subscribeArkadeSaveLifecycle,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import type { ArkadeSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-types'
import {
  acknowledgeOnchainSaveErrorForForcedLock,
  getOnchainSaveLifecycleSnapshot,
  orchestrateOnchainRetrySave,
  subscribeOnchainSaveLifecycle,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

type SaveErrorRail = 'onchain' | 'arkade'

function SaveErrorBannerBlock({
  rail,
  title,
  errorMessage,
  isSaving,
  lockAnywayMessage,
  onRetry,
  onLockAnywayConfirm,
}: {
  rail: SaveErrorRail
  title: string
  errorMessage: string
  isSaving: boolean
  lockAnywayMessage: string
  onRetry: () => void
  onLockAnywayConfirm: () => void
}) {
  const [lockAnywayOpen, setLockAnywayOpen] = useState(false)

  return (
    <>
      <div
        role="alert"
        data-testid={`wallet-save-error-banner-${rail}`}
        className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-1 gap-3">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-500"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs break-words text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={onRetry}
          >
            {isSaving ? 'Saving...' : 'Retry'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={isSaving}
            onClick={() => setLockAnywayOpen(true)}
          >
            Lock anyway
          </Button>
        </div>
      </div>

      <ConfirmationDialog
        open={lockAnywayOpen}
        title="Lock without saving?"
        message={lockAnywayMessage}
        confirmText="Lock anyway"
        cancelText="Cancel"
        onConfirm={() => {
          onLockAnywayConfirm()
          setLockAnywayOpen(false)
        }}
        onCancel={() => setLockAnywayOpen(false)}
      />
    </>
  )
}

export function WalletSaveErrorBanner() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const [onchainSaveSnapshot, setOnchainSaveSnapshot] = useState<OnchainSaveLifecycleSnapshot>(
    () => getOnchainSaveLifecycleSnapshot(),
  )
  const [arkadeSaveSnapshot, setArkadeSaveSnapshot] = useState<ArkadeSaveLifecycleSnapshot>(
    () => getArkadeSaveLifecycleSnapshot(),
  )

  useEffect(() => {
    return subscribeOnchainSaveLifecycle(setOnchainSaveSnapshot)
  }, [])

  useEffect(() => {
    return subscribeArkadeSaveLifecycle(setArkadeSaveSnapshot)
  }, [])

  const showOnchain =
    networkMode !== 'lab' &&
    (onchainSaveSnapshot.savePhase === 'save-error' || onchainSaveSnapshot.savePhase === 'saving')
  const showArkade =
    isArkadeActiveForNetworkMode(networkMode) &&
    (arkadeSaveSnapshot.savePhase === 'save-error' || arkadeSaveSnapshot.savePhase === 'saving')

  if (!showOnchain && !showArkade) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      {showOnchain ? (
        <SaveErrorBannerBlock
          rail="onchain"
          title="Couldn't save wallet to storage"
          errorMessage={onchainSaveSnapshot.errorMessage ?? 'Save failed'}
          isSaving={onchainSaveSnapshot.savePhase === 'saving'}
          lockAnywayMessage="Recent on-chain activity may not be persisted on this device. You can retry saving from the dashboard before locking if you need the latest state stored."
          onRetry={() => {
            void orchestrateOnchainRetrySave()
          }}
          onLockAnywayConfirm={acknowledgeOnchainSaveErrorForForcedLock}
        />
      ) : null}
      {showArkade ? (
        <SaveErrorBannerBlock
          rail="arkade"
          title="Couldn't save Arkade wallet to storage"
          errorMessage={arkadeSaveSnapshot.errorMessage ?? 'Save failed'}
          isSaving={arkadeSaveSnapshot.savePhase === 'saving'}
          lockAnywayMessage="Recent Arkade operator or SDK state may not be persisted on this device. You can retry saving from the dashboard before locking if you need the latest state stored."
          onRetry={() => {
            void orchestrateArkadeRetrySave()
          }}
          onLockAnywayConfirm={acknowledgeArkadeSaveErrorForForcedLock}
        />
      ) : null}
    </div>
  )
}

/** @deprecated Use WalletSaveErrorBanner */
export const OnchainSaveErrorBanner = WalletSaveErrorBanner
