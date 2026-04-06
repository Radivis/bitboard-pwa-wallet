import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Shield, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
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

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && phase === 'running') return
    onOpenChange(next)
  }

  const handleDone = () => {
    onOpenChange(false)
  }

  const blockDismiss = phase === 'running'

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onInteractOutside={(e) => blockDismiss && e.preventDefault()}
        onEscapeKeyDown={(e) => blockDismiss && e.preventDefault()}
      >
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/[0.08] px-2.5 py-1.5 shadow-sm dark:bg-cyan-950/40"
            title="Turn on Infomode to tap underlined labels for explanations"
          >
            <InfomodeToggle className="h-10 w-10 shadow-sm" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 opacity-70 ring-offset-background hover:opacity-100"
            aria-label="Close"
            disabled={blockDismiss}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>

        {phase === 'form' && (
          <div className="space-y-4">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 pr-[10.5rem] sm:pr-[13.5rem]">
                <Shield className="h-5 w-5 shrink-0" />
                Change app password
              </DialogTitle>
              <DialogDescription className="w-full max-w-none text-pretty">
                Enter your current password, then choose a new one. All stored wallet data will be
                re-encrypted in one step.
              </DialogDescription>
            </DialogHeader>

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

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
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
          <div className="flex flex-col items-center gap-4 py-8 pt-14">
            <LoadingSpinner text="Encrypting secrets with new password…" />
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-4 py-6 pt-14 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Password updated</p>
              <p className="text-sm text-muted-foreground">
                All wallet secrets are now encrypted with your new password.
              </p>
            </div>
            <Button type="button" className="mt-2" onClick={handleDone}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
