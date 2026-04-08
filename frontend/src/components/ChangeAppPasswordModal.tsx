import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Shield, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AppModal } from '@/components/AppModal'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  AppPasswordFields,
  isNewAppPasswordValid,
} from '@/components/AppPasswordFields'
import { AppPasswordFundsLossWarning } from '@/components/AppPasswordFundsLossWarning'
import {
  ensureMigrated,
  getDatabase,
  reencryptAllWalletSecretsWithNewPassword,
} from '@/db'
import { useSessionStore } from '@/stores/sessionStore'
import { errorMessage } from '@/lib/utils'

const CHANGE_APP_PASSWORD_FIELDS_CONFIG = {
  ids: {
    newPassword: 'change-app-new-password',
    confirmPassword: 'change-app-confirm-password',
  },
  infoIds: {
    passwordLabel: 'change-app-new-password-label',
    strength: 'change-app-new-password-strength',
  },
} as const

type Phase = 'form' | 'running' | 'success'

interface ChangeAppPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangeAppPasswordModal({
  open,
  onOpenChange,
}: ChangeAppPasswordModalProps) {
  const [phase, setPhase] = useState<Phase>('form')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const setSessionPassword = useSessionStore((s) => s.setPassword)

  useEffect(() => {
    if (open) {
      setPhase('form')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [open])

  const reencryptMutation = useMutation({
    mutationFn: async (params: { current: string; next: string }) => {
      await ensureMigrated()
      const walletDb = getDatabase()
      await reencryptAllWalletSecretsWithNewPassword({
        walletDb,
        oldPassword: params.current,
        newPassword: params.next,
      })
      setSessionPassword(params.next)
    },
    onSuccess: () => {
      setPhase('success')
    },
    onError: (err) => {
      setPhase('form')
      toast.error(
        errorMessage(err) ||
          'Could not change password. Check your current password and try again.',
      )
    },
  })

  const newValid = isNewAppPasswordValid(newPassword, confirmPassword)
  const canSubmit =
    currentPassword.length > 0 && newValid && !reencryptMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setPhase('running')
    reencryptMutation.mutate({ current: currentPassword, next: newPassword })
  }

  const blockDismiss = phase === 'running'

  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      onCancel={() => {}}
      title={
        <>
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0">Change app password</span>
        </>
      }
      isBlockDismissed={blockDismiss}
      contentClassName="sm:max-w-md"
    >
      {(requestClose) => (
        <>
          {phase === 'form' && (
            <div className="space-y-4">
              <DialogDescription className="w-full max-w-none text-pretty text-left">
                Enter your current password, then choose a new one. All stored wallet data will be
                re-encrypted in one step.
              </DialogDescription>

              <AppPasswordFundsLossWarning />

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="change-app-current-password">
                    <InfomodeWrapper
                      as="span"
                      infoId="change-app-current-password-label"
                      infoTitle="Current Bitboard app password"
                      infoText="This must match the password that currently encrypts your wallets on this device. It is the same password you use to unlock Bitboard after locking or restarting."
                    >
                      Current password
                    </InfomodeWrapper>
                  </Label>
                  <Input
                    id="change-app-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current app password"
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>

                <AppPasswordFields
                  config={CHANGE_APP_PASSWORD_FIELDS_CONFIG}
                  newPassword={newPassword}
                  confirmPassword={confirmPassword}
                  onNewPasswordChange={setNewPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                  autoFocusNewPassword={false}
                />

                <div className="flex justify-between gap-4">
                  <Button type="button" variant="outline" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!canSubmit}>
                    Change password
                  </Button>
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
                <p className="font-medium text-foreground">Password updated</p>
                <p className="text-sm text-muted-foreground">
                  All wallet secrets are now encrypted with your new password.
                </p>
              </div>
              <Button type="button" className="mt-2" onClick={requestClose}>
                Done
              </Button>
            </div>
          )}
        </>
      )}
    </AppModal>
  )
}
