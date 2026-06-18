import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppModal } from '@/components/AppModal'
import { beginWalletSecretsSession } from '@/lib/wallet/wallet-secrets-session'
import {
  AppPasswordFields,
  isNewAppPasswordValid,
} from '@/components/AppPasswordFields'
import { AppPasswordFundsLossWarning } from '@/components/AppPasswordFundsLossWarning'
import { NearZeroSecurityOptIn } from '@/components/NearZeroSecurityOptIn'

const SET_APP_PASSWORD_FIELDS_CONFIG = {
  ids: {
    newPassword: 'app-password',
    confirmPassword: 'app-confirm-password',
  },
  infoIds: {
    passwordLabel: 'set-app-password-label',
    strength: 'set-app-password-strength',
  },
} as const

interface SetAppPasswordModalProps {
  open: boolean
  /** Called after the secrets session has been started successfully. */
  onSessionStarted?: () => void
}

/**
 * Blocking first-run dialog: set the Bitboard app password before any wallet exists.
 * On success, starts the encryption-worker secrets session (same secret used to encrypt all wallets).
 */
export function SetAppPasswordModal({ open, onSessionStarted }: SetAppPasswordModalProps) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirmPassword('')
      setIsSubmitting(false)
      setSubmitError(null)
    }
  }, [open])

  const passwordsValid = isNewAppPasswordValid(password, confirmPassword)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordsValid || isSubmitting) return
    void (async () => {
      setIsSubmitting(true)
      setSubmitError(null)
      try {
        await beginWalletSecretsSession(password)
        onSessionStarted?.()
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to set app password. Please try again.'
        setSubmitError(message)
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  const handleBackToSetup = () => {
    navigate({ to: '/setup' })
  }

  return (
    <AppModal
      isOpen={open}
      onOpenChange={() => {}}
      onCancel={handleBackToSetup}
      title={
        <>
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0 leading-tight">Set Bitboard app password</span>
        </>
      }
      closeAriaLabel="Back to setup"
      contentClassName="sm:max-w-md"
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
    >
      <div className="space-y-4">
        <DialogDescription className="w-full max-w-none text-left text-sm text-muted-foreground">
          Choose a password for this browser. It encrypts all wallets you store in Bitboard on this
          device.{' '}
          <span className="font-medium text-foreground/90">
            Use Infomode (lightbulb button above) to get more information about parts of this form
            by tapping them.
          </span>
        </DialogDescription>

        <AppPasswordFundsLossWarning />

        <form onSubmit={handleSubmit} className="space-y-4">
          <AppPasswordFields
            config={SET_APP_PASSWORD_FIELDS_CONFIG}
            newPassword={password}
            confirmPassword={confirmPassword}
            onNewPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
          />

          {submitError != null && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <Button type="submit" className="w-full" disabled={!passwordsValid || isSubmitting}>
            Continue
          </Button>

          <Button variant="ghost" className="w-full" asChild>
            <Link to="/setup">Back to setup</Link>
          </Button>
        </form>

        <NearZeroSecurityOptIn />
      </div>
    </AppModal>
  )
}
