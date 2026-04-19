import { useCallback, useEffect, useId, useState } from 'react'
import { DialogDescription } from '@/components/ui/dialog'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WalletBackupImportPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: (password: string) => void | Promise<void>
  isBusy: boolean
  /** Shown after a failed verification attempt (before the bypass modal). */
  verificationError?: string | null
  /** Increment to clear the password field and refocus (e.g. after a failed attempt). */
  passwordResetKey?: number
}

export function WalletBackupImportPasswordModal({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
  isBusy,
  verificationError = null,
  passwordResetKey = 0,
}: WalletBackupImportPasswordModalProps) {
  const [password, setPassword] = useState('')
  const pwdId = useId()

  useEffect(() => {
    if (!open) setPassword('')
  }, [open])

  useEffect(() => {
    if (!open || passwordResetKey === 0) return
    setPassword('')
    window.setTimeout(() => {
      document.getElementById(pwdId)?.focus()
    }, 0)
  }, [open, passwordResetKey, pwdId])

  const handleCancel = useCallback(() => {
    setPassword('')
    onCancel()
  }, [onCancel])

  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Verify wallet backup"
      onCancel={handleCancel}
      isBlockDismissed={isBusy}
      footer={() => (
        <>
          <Button type="button" variant="outline" disabled={isBusy} onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isBusy || password.length === 0}
            onClick={() => void onConfirm(password)}
          >
            {isBusy ? 'Verifying…' : 'Verify and import'}
          </Button>
        </>
      )}
    >
      <DialogDescription className="text-left">
        Enter the password that was used when this backup was signed (often your Bitboard app
        password). The file will only be imported if the signature matches.
      </DialogDescription>
      <div className="mt-4 space-y-2">
        <Label htmlFor={pwdId}>Signing password</Label>
        <Input
          id={pwdId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isBusy}
        />
        {verificationError ? (
          <p className="text-sm text-destructive" role="alert" aria-live="assertive">
            {verificationError}
          </p>
        ) : null}
      </div>
    </AppModal>
  )
}
