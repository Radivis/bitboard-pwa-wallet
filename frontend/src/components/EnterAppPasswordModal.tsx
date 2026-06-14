import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { DialogDescription } from '@/components/ui/dialog'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface ConfirmAppPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: (password: string) => void
  isBusy?: boolean
  title?: string
  description?: string
  submitLabel?: string
  loadingText?: string
}

export function ConfirmAppPasswordModal({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
  isBusy = false,
  title = 'Enter app password',
  description = 'Enter your Bitboard app password to continue.',
  submitLabel = 'Continue',
  loadingText = 'Working…',
}: ConfirmAppPasswordModalProps) {
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!open) {
      setPassword('')
    }
  }, [open])

  const handleClose = () => {
    if (isBusy) return
    onCancel()
    onOpenChange(false)
  }

  return (
    <AppModal
      isOpen={open}
      isModal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose()
        else onOpenChange(nextOpen)
      }}
      onCancel={handleClose}
      title={
        <>
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0">{title}</span>
        </>
      }
      contentClassName="sm:max-w-md"
      onInteractOutside={(e) => {
        if (isBusy) e.preventDefault()
      }}
    >
      <>
        <DialogDescription>{description}</DialogDescription>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!password || isBusy) return
            onConfirm(password)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="confirm-app-password">Bitboard app password</Label>
            <PasswordInput
              id="confirm-app-password"
              passwordKind="app"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Bitboard app password"
              disabled={isBusy}
              autoFocus
            />
          </div>

          {isBusy ? (
            <LoadingSpinner text={loadingText} />
          ) : (
            <Button type="submit" className="w-full" disabled={!password}>
              {submitLabel}
            </Button>
          )}
        </form>
      </>
    </AppModal>
  )
}
