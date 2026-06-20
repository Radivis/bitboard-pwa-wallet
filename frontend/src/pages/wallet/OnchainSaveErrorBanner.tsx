import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import {
  acknowledgeOnchainSaveErrorForForcedLock,
  getOnchainSaveLifecycleSnapshot,
  orchestrateOnchainRetrySave,
  subscribeOnchainSaveLifecycle,
} from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import type { OnchainSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-types'

export function OnchainSaveErrorBanner() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const [saveSnapshot, setSaveSnapshot] = useState<OnchainSaveLifecycleSnapshot>(() =>
    getOnchainSaveLifecycleSnapshot(),
  )
  const [lockAnywayOpen, setLockAnywayOpen] = useState(false)

  useEffect(() => {
    return subscribeOnchainSaveLifecycle(setSaveSnapshot)
  }, [])
  const isSaving = saveSnapshot.savePhase === 'saving'

  if (
    networkMode === 'lab' ||
    (saveSnapshot.savePhase !== 'save-error' && !isSaving)
  ) {
    return null
  }

  const errorMessage = saveSnapshot.errorMessage ?? 'Save failed'

  return (
    <>
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-1 gap-3">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-500"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t save wallet to storage
            </p>
            <p className="text-xs break-words text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => {
              void orchestrateOnchainRetrySave()
            }}
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
        message="Recent on-chain activity may not be persisted on this device. You can retry saving from the dashboard before locking if you need the latest state stored."
        confirmText="Lock anyway"
        cancelText="Cancel"
        onConfirm={() => {
          acknowledgeOnchainSaveErrorForForcedLock()
          setLockAnywayOpen(false)
        }}
        onCancel={() => setLockAnywayOpen(false)}
      />
    </>
  )
}
