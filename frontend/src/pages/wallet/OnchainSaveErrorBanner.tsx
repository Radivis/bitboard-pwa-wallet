import { useEffect, useRef, useState } from 'react'
import type { SaveLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
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
import type { LightningSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-types'
import {
  acknowledgeLightningSaveErrorForForcedLock,
  getLightningSaveLifecycleSnapshot,
  orchestrateLightningRetrySave,
  subscribeLightningSaveLifecycle,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { isLightningSupported } from '@/lib/lightning/lightning-utils'
import { useFeatureStore } from '@/stores/featureStore'
import {
  acknowledgeOnchainSaveErrorForForcedLock,
  getOnchainSaveLifecycleSnapshot,
  orchestrateOnchainRetrySave,
  subscribeOnchainSaveLifecycle,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

type SaveErrorRail = 'onchain' | 'arkade' | 'lightning'

/**
 * Show save-error banners only for real failures. Normal post-sync `saving` during
 * hydration must not flash the error UI (see wallet-rail-lifecycle.md save-error policy).
 * Keep the banner visible through `saving` only while retrying after `save-error`.
 */
function useSaveErrorBannerVisible(savePhase: SaveLifecyclePhase): boolean {
  const hadSaveErrorRef = useRef(false)

  if (savePhase === 'save-error') {
    hadSaveErrorRef.current = true
  } else if (savePhase === 'not-saving' || savePhase === 'not-configured') {
    hadSaveErrorRef.current = false
  }

  return (
    savePhase === 'save-error' || (savePhase === 'saving' && hadSaveErrorRef.current)
  )
}

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
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const [onchainSaveSnapshot, setOnchainSaveSnapshot] = useState<OnchainSaveLifecycleSnapshot>(
    () => getOnchainSaveLifecycleSnapshot(),
  )
  const [arkadeSaveSnapshot, setArkadeSaveSnapshot] = useState<ArkadeSaveLifecycleSnapshot>(
    () => getArkadeSaveLifecycleSnapshot(),
  )
  const [lightningSaveSnapshot, setLightningSaveSnapshot] =
    useState<LightningSaveLifecycleSnapshot>(() => getLightningSaveLifecycleSnapshot())

  useEffect(() => {
    return subscribeOnchainSaveLifecycle(setOnchainSaveSnapshot)
  }, [])

  useEffect(() => {
    return subscribeArkadeSaveLifecycle(setArkadeSaveSnapshot)
  }, [])

  useEffect(() => {
    return subscribeLightningSaveLifecycle(setLightningSaveSnapshot)
  }, [])

  const showOnchainSaveError = useSaveErrorBannerVisible(onchainSaveSnapshot.savePhase)
  const showArkadeSaveError = useSaveErrorBannerVisible(arkadeSaveSnapshot.savePhase)
  const showLightningSaveError = useSaveErrorBannerVisible(lightningSaveSnapshot.savePhase)

  const showOnchain = networkMode !== 'lab' && showOnchainSaveError
  const showArkade = isArkadeActiveForNetworkMode(networkMode) && showArkadeSaveError
  const showLightning =
    isLightningEnabled &&
    isLightningSupported(networkMode) &&
    lightningSaveSnapshot.railScope != null &&
    showLightningSaveError

  if (!showOnchain && !showArkade && !showLightning) {
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
      {showLightning ? (
        <SaveErrorBannerBlock
          rail="lightning"
          title="Couldn't save Lightning wallet to storage"
          errorMessage={lightningSaveSnapshot.errorMessage ?? 'Save failed'}
          isSaving={lightningSaveSnapshot.savePhase === 'saving'}
          lockAnywayMessage="Recent Lightning connection or NWC snapshot data may not be persisted on this device. You can retry saving from the dashboard before locking if you need the latest state stored."
          onRetry={() => {
            void orchestrateLightningRetrySave()
          }}
          onLockAnywayConfirm={acknowledgeLightningSaveErrorForForcedLock}
        />
      ) : null}
    </div>
  )
}

/** @deprecated Use WalletSaveErrorBanner */
export const OnchainSaveErrorBanner = WalletSaveErrorBanner
