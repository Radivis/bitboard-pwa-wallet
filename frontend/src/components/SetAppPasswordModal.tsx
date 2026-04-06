import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { KeyRound, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/sessionStore'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
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
}

/**
 * Blocking first-run dialog: set the Bitboard app password before any wallet exists.
 * On success, stores the password in the session store (same secret used to encrypt all wallets).
 */
export function SetAppPasswordModal({ open }: SetAppPasswordModalProps) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const setSessionPassword = useSessionStore((s) => s.setPassword)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirmPassword('')
    }
  }, [open])

  const passwordsValid = isNewAppPasswordValid(password, confirmPassword)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordsValid) return
    setSessionPassword(password)
  }

  const handleBackToSetup = () => {
    navigate({ to: '/setup' })
  }

  return (
    <Dialog open={open} modal onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
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
            aria-label="Back to setup"
            onClick={handleBackToSetup}
          >
            <X className="size-4" />
            <span className="sr-only">Back to setup</span>
          </Button>
        </div>

        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="flex items-start gap-2 pr-[10.5rem] sm:pr-[13.5rem]">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="min-w-0 leading-tight">Set Bitboard app password</span>
          </DialogTitle>
        </DialogHeader>
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

          <Button type="submit" className="w-full" disabled={!passwordsValid}>
            Continue
          </Button>

          <Button variant="ghost" className="w-full" asChild>
            <Link to="/setup">Back to setup</Link>
          </Button>
        </form>

          <NearZeroSecurityOptIn />
        </div>
      </DialogContent>
    </Dialog>
  )
}
