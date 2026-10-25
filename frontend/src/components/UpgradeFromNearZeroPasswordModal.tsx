import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { DialogDescription } from '@/components/ui/dialog'
import { DesignButton } from '@/components/design/DesignButton'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DesignModal } from '@/components/design/DesignModal'
import {
  AppPasswordFields,
  isNewAppPasswordValid,
} from '@/components/AppPasswordFields'
import { AppPasswordFundsLossWarning } from '@/components/AppPasswordFundsLossWarning'
import {
  ensureSchemaAndDataMigrated,
  getDatabase,
  upgradeNearZeroToUserPassword,
} from '@/db'
import { invalidateWalletRelatedQueriesAndNotifyOtherTabs } from '@/lib/wallet/wallet-query-cache-sync'
import { errorMessage } from '@/lib/shared/utils'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet/wallet-unlocked-status'
import { useWalletStore } from '@/stores/walletStore'
import { startAutoLockTimer } from '@/stores/sessionStore'
import { orchestrateLock } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const UPGRADE_FIELDS_CONFIG = {
  ids: {
    newPassword: 'upgrade-near-zero-new-password',
    confirmPassword: 'upgrade-near-zero-confirm-password',
  },
  infoIds: {
    passwordLabel: 'upgrade-near-zero-new-password-label',
    strength: 'upgrade-near-zero-new-password-strength',
  },
} as const

type Phase = 'form' | 'running' | 'success'

interface UpgradeFromNearZeroPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Replaces near-zero session secret with a user-chosen password and removes near-zero settings.
 */
export function UpgradeFromNearZeroPasswordModal({
  open,
  onOpenChange,
}: UpgradeFromNearZeroPasswordModalProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('form')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)
  const sessionActive = walletIsUnlockedOrSyncing(walletStatus)

  useEffect(() => {
    if (open) {
      setPhase('form')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [open])

  const upgradeMutation = useMutation({
    mutationFn: async (next: string) => {
      if (!walletIsUnlockedOrSyncing(useWalletStore.getState().walletStatus)) {
        throw new Error('Session expired — unlock and try again.')
      }
      await ensureSchemaAndDataMigrated()
      const walletDb = getDatabase()
      await upgradeNearZeroToUserPassword({
        walletDb,
        newPassword: next,
      })
    },
    onSuccess: () => {
      invalidateWalletRelatedQueriesAndNotifyOtherTabs(queryClient)
      startAutoLockTimer(() => void orchestrateLock())
      setPhase('success')
    },
    onError: (err) => {
      setPhase('form')
      toast.error(
        errorMessage(err) || 'Could not set password. Try again.',
      )
    },
  })

  const newValid = isNewAppPasswordValid(newPassword, confirmPassword)
  const canSubmit = newValid && !upgradeMutation.isPending && sessionActive

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setPhase('running')
    upgradeMutation.mutate(newPassword)
  }

  const blockDismiss = phase === 'running'

  return (
    <DesignModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => {}}
      title={
        <>
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0">Set a real app password</span>
        </>
      }
      isBlockDismissed={blockDismiss}
    >
      {(requestClose) => (
        <>
          {phase === 'form' && (
            <div className="space-y-4">
              <DialogDescription className="text-left">
                You are using near-zero security mode. Choose a strong password you can remember.
                Your wallet data will be re-encrypted with it.
              </DialogDescription>

              <AppPasswordFundsLossWarning />

              <form onSubmit={handleSubmit} className="space-y-4">
                <AppPasswordFields
                  config={UPGRADE_FIELDS_CONFIG}
                  newPassword={newPassword}
                  confirmPassword={confirmPassword}
                  onNewPasswordChange={setNewPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                />

                <div className="flex justify-between gap-4">
                  <DesignButton type="button" appearance="secondary" onClick={requestClose}>
                    Cancel
                  </DesignButton>
                  <DesignButton type="submit" disabled={!canSubmit}>
                    Set password
                  </DesignButton>
                </div>
              </form>
            </div>
          )}

          {phase === 'running' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <LoadingSpinner text="Encrypting secrets with new password…" />
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" aria-hidden />
              <div className="space-y-1">
                <p className="design-type-emphasis text-foreground">Password saved</p>
                <p className="design-type-regular text-muted-foreground">
                  Near-zero security mode is off. Your wallets use your new password now.
                </p>
              </div>
              <DesignButton type="button" className="mt-2" onClick={requestClose}>
                Done
              </DesignButton>
            </div>
          )}
        </>
      )}
    </DesignModal>
  )
}
