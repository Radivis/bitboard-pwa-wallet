import { useCallback, useEffect, useId, useState } from 'react'
import { DialogDescription } from '@/components/ui/dialog'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WalletBackupExportPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  /** Called with the password the user entered to authorize signing. */
  onConfirm: (password: string) => void | Promise<void>
  isBusy: boolean
}

export function WalletBackupExportPasswordModal({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
  isBusy,
}: WalletBackupExportPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const pwdId = useId()
  const confirmPwdId = useId()

  const passwordsMatch = password === confirmPassword
  const canSubmit =
    password.length > 0 && confirmPassword.length > 0 && passwordsMatch

  useEffect(() => {
    if (!open) {
      setPassword('')
      setConfirmPassword('')
    }
  }, [open])

  const handleCancel = useCallback(() => {
    setPassword('')
    setConfirmPassword('')
    onCancel()
  }, [onCancel])

  return (
    <AppModal
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Sign wallet backup"
      onCancel={handleCancel}
      isBlockDismissed={isBusy}
      footer={() => (
        <>
          <Button type="button" variant="outline" disabled={isBusy} onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isBusy || !canSubmit}
            onClick={() => void onConfirm(password)}
          >
            {isBusy ? 'Signing…' : 'Sign and export'}
          </Button>
        </>
      )}
    >
      <DialogDescription asChild>
        <div className="space-y-3 text-left text-sm text-foreground">
          <p>
            This export is cryptographically signed. Use a <strong>strong</strong> password for
            signing—ideally your <strong>current Bitboard app password</strong>, so you only have one
            secret to remember when you restore this backup later.
          </p>
          <p>
            Enter that password twice below. Repeating it catches typos; you will need the{' '}
            <em>exact</em> same password to verify the backup on import.
          </p>
          <p className="text-muted-foreground">
            The ZIP contains your wallet database plus a small manifest file used to check integrity.
          </p>
        </div>
      </DialogDescription>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor={pwdId}>Password for signing</Label>
          <Input
            id={pwdId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={confirmPwdId}>Confirm password</Label>
          <Input
            id={confirmPwdId}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isBusy}
          />
        </div>
        {password.length > 0 && confirmPassword.length > 0 && !passwordsMatch ? (
          <p className="text-sm text-destructive" role="alert">
            Passwords do not match.
          </p>
        ) : null}
      </div>
    </AppModal>
  )
}
