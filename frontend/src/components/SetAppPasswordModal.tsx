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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { InfomodeToggle } from '@/components/infomode/InfomodeToggle'
import { useSessionStore } from '@/stores/sessionStore'

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

  const passwordsValid = password.length >= 8 && password === confirmPassword

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
        <DialogDescription className="w-full max-w-none text-left text-sm text-muted-foreground">
          Choose a password for this browser. It encrypts all wallets you store in Bitboard on this
          device.{' '}
          <span className="font-medium text-foreground/90">
            Use Infomode (lightbulb button above) to get more information about parts of this form by tapping them.
          </span>
        </DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-password">
              <InfomodeWrapper
                as="span"
                infoId="set-app-password-label"
                infoTitle="Bitboard app password"
                infoText="This password is only for Bitboard in this browser. It encrypts your wallet data on this device. The same password protects every wallet you add here. Your recovery words are what move between apps—not this password."
              >
                Password
              </InfomodeWrapper>
            </Label>
            <Input
              id="app-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a strong password"
              autoFocus
              autoComplete="new-password"
            />
            <InfomodeWrapper
              as="div"
              className="w-full"
              infoId="set-app-password-strength"
              infoTitle="Why a strong password matters"
              infoText="Bitboard derives encryption keys from this password to protect your wallet secrets on this device. A stronger password makes guessing and cracking much harder for anyone who gets access to stored data or your unlocked session. It does not replace your recovery phrase—the phrase backs up your funds elsewhere; this password protects the encrypted copy in this browser."
            >
              {password ? (
                <PasswordStrengthIndicator password={password} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Strength feedback appears as you type.
                </p>
              )}
            </InfomodeWrapper>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-confirm-password">Confirm password</Label>
            <Input
              id="app-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={!passwordsValid}>
            Continue
          </Button>

          <Button variant="ghost" className="w-full" asChild>
            <Link to="/setup">Back to setup</Link>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
