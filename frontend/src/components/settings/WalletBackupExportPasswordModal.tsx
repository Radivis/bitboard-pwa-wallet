import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { DialogDescription } from '@/components/ui/dialog'
import { AppModal } from '@/components/AppModal'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { APP_PASSWORD_MIN_LENGTH } from '@/lib/app-password-policy'

export type AppPasswordCompareResult =
  | { match: true; skipped: false }
  | { match: false; skipped: false }
  | { match: false; skipped: true }

interface WalletBackupExportPasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  /** Called with the password the user entered to authorize signing. */
  onConfirm: (password: string) => void | Promise<void>
  isBusy: boolean
  /**
   * After both password fields match, verifies the signing password against the app password
   * (same check as decrypting wallet secrets). Not called when fields do not match.
   */
  checkSigningPasswordMatchesAppPassword: (
    password: string,
  ) => Promise<AppPasswordCompareResult>
}

export function WalletBackupExportPasswordModal({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
  isBusy,
  checkSigningPasswordMatchesAppPassword,
}: WalletBackupExportPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [comparePending, setComparePending] = useState(false)
  const [compareResult, setCompareResult] = useState<AppPasswordCompareResult | null>(null)
  const compareGenerationRef = useRef(0)
  const pwdId = useId()
  const confirmPwdId = useId()

  const passwordsMatch = password === confirmPassword
  const meetsMinLength = password.length >= APP_PASSWORD_MIN_LENGTH
  const canCompare =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    meetsMinLength

  const canSubmit = canCompare && !comparePending && compareResult !== null

  useEffect(() => {
    if (!open) {
      setPassword('')
      setConfirmPassword('')
      setComparePending(false)
      setCompareResult(null)
      compareGenerationRef.current += 1
    }
  }, [open])

  useEffect(() => {
    if (!open || !canCompare) {
      setComparePending(false)
      setCompareResult(null)
      return
    }

    const gen = ++compareGenerationRef.current
    setComparePending(true)
    setCompareResult(null)

    void (async () => {
      try {
        const result = await checkSigningPasswordMatchesAppPassword(password)
        if (compareGenerationRef.current !== gen) return
        setCompareResult(result)
      } catch {
        if (compareGenerationRef.current !== gen) return
        setCompareResult({ match: false, skipped: false })
      } finally {
        if (compareGenerationRef.current === gen) {
          setComparePending(false)
        }
      }
    })()
  }, [open, canCompare, password, confirmPassword, checkSigningPasswordMatchesAppPassword])

  const handleCancel = useCallback(() => {
    setPassword('')
    setConfirmPassword('')
    setComparePending(false)
    setCompareResult(null)
    compareGenerationRef.current += 1
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
            Enter that password twice below (at least {APP_PASSWORD_MIN_LENGTH} characters, same as
            Bitboard app passwords). Repeating it catches typos; you will need the{' '}
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
          <PasswordInput
            id={pwdId}
            passwordKind="export"
            minLength={APP_PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={confirmPwdId}>Confirm password</Label>
          <PasswordInput
            id={confirmPwdId}
            passwordKind="export"
            nameSuffix="confirm"
            minLength={APP_PASSWORD_MIN_LENGTH}
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
        {password.length > 0 &&
        confirmPassword.length > 0 &&
        passwordsMatch &&
        !meetsMinLength ? (
          <p className="text-sm text-destructive" role="alert">
            Use at least {APP_PASSWORD_MIN_LENGTH} characters (Bitboard’s minimum app password length).
          </p>
        ) : null}
        {canCompare ? (
          <div className="space-y-2" aria-live="polite">
            {comparePending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Checking against your Bitboard app password…
              </p>
            ) : compareResult?.skipped ? (
              <p className="text-sm text-muted-foreground">
                Could not compare to the app password (no wallet selected). You can still export; use
                a password you will remember for import verification.
              </p>
            ) : compareResult?.match ? (
              <p
                className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400"
                role="status"
              >
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                Same as your Bitboard app password for this wallet.
              </p>
            ) : (
              <p
                className="flex items-start gap-2 text-sm font-medium text-destructive"
                role="status"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This password does not match your Bitboard app password. You can still export, but
                  you will need this signing password (not the app password) to verify the backup on
                  import.
                </span>
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AppModal>
  )
}
