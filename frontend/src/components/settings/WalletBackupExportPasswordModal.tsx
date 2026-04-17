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
  const pwdId = useId()

  useEffect(() => {
    if (!open) setPassword('')
  }, [open])

  const handleCancel = useCallback(() => {
    setPassword('')
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
            disabled={isBusy || password.length === 0}
            onClick={() => void onConfirm(password)}
          >
            {isBusy ? 'Signing…' : 'Sign and export'}
          </Button>
        </>
      )}
    >
      <DialogDescription className="text-left">
        Enter your Bitboard app password to create a cryptographic signature on this export. The ZIP
        will include your wallet database plus a manifest file that proves integrity when you
        import it later.
      </DialogDescription>
      <div className="mt-4 space-y-2">
        <Label htmlFor={pwdId}>App password</Label>
        <Input
          id={pwdId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isBusy}
        />
      </div>
    </AppModal>
  )
}
