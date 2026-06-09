import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AppModal } from '@/components/AppModal'
import { useWalletStore } from '@/stores/walletStore'
import { useWallets } from '@/db'
import {
  loadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet/wallet-utils'
import {
  beginWalletSecretsSession,
  endWalletSecretsSession,
} from '@/lib/wallet/wallet-secrets-session'
import { reportWalletSyncError } from '@/lib/wallet/wallet-sync-error-toast'
import { toUserFriendlyWalletSecretsError } from '@/lib/wallet/wallet-secrets-error-messages'

interface WalletUnlockProps {
  walletName?: string
  /** When adding a wallet from setup while the session is locked, use setup-specific copy and navigation. */
  variant?: 'default' | 'setup'
  /**
   * When set, closing the dialog invokes this instead of navigating away (e.g. inline unlock on Settings).
   */
  onDismiss?: () => void
  /** Called after password unlock and wallet load succeed. */
  onUnlockSuccess?: () => void
}

export function WalletUnlock({
  walletName,
  variant = 'default',
  onDismiss,
  onUnlockSuccess,
}: WalletUnlockProps) {
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { data: wallets } = useWallets()

  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const addressType = useWalletStore((walletState) => walletState.addressType)
  const accountId = useWalletStore((walletState) => walletState.accountId)

  const handleClose = () => {
    if (onDismiss) {
      onDismiss()
      return
    }
    if (variant === 'setup') {
      navigate({ to: '/setup' })
      return
    }
    if (wallets && wallets.length > 1) {
      navigate({ to: '/wallet/wallets' })
    } else {
      navigate({ to: '/setup' })
    }
  }

  const [unlockErrorMessage, setUnlockErrorMessage] = useState<string | null>(null)

  const unlockMutation = useMutation({
    mutationFn: async (walletPassword: string) => {
      setUnlockErrorMessage(null)
      if (!activeWalletId) throw new Error('No active wallet')

      const { setManualWalletUnlockInFlight } = useWalletStore.getState()
      setManualWalletUnlockInFlight(true)
      try {
        await beginWalletSecretsSession(walletPassword)
        try {
          if (networkMode === 'lab') {
            await loadDescriptorWalletWithoutSync({
              walletId: activeWalletId,
              networkMode,
              addressType,
              accountId,
            })
          } else {
            await loadDescriptorWalletAndSync({
              walletId: activeWalletId,
              networkMode,
              addressType,
              accountId,
              awaitSync: false,
              onSyncError: (err) =>
                reportWalletSyncError('unlock-background-sync', err),
            })
          }
        } catch (err) {
          await endWalletSecretsSession()
          throw err
        }
      } finally {
        setManualWalletUnlockInFlight(false)
      }
    },
    onSuccess: () => {
      onUnlockSuccess?.()
    },
    onError: (err) => {
      const message = toUserFriendlyWalletSecretsError(err)
      setUnlockErrorMessage(message)
      toast.error(message)
    },
  })

  return (
    <AppModal
      isOpen
      isModal
      onOpenChange={() => {}}
      onCancel={handleClose}
      title={
        <>
          <Lock className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0">
            {variant === 'setup' ? 'Unlock to continue' : 'Unlock Wallet'}
          </span>
        </>
      }
      contentClassName="sm:max-w-md"
      onInteractOutside={(e) => e.preventDefault()}
    >
      <>
        <DialogDescription>
          {variant === 'setup'
            ? 'Enter your Bitboard app password to unlock an existing wallet before you add or import another.'
            : walletName
              ? `Enter your Bitboard app password to unlock "${walletName}".`
              : 'Enter your Bitboard app password to unlock your wallet.'}
        </DialogDescription>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            unlockMutation.mutate(password)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="unlock-password">Bitboard app password</Label>
            <PasswordInput
              id="unlock-password"
              passwordKind="app"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Bitboard app password"
              disabled={unlockMutation.isPending}
              autoFocus
            />
          </div>

          {unlockErrorMessage != null && (
            <p className="text-sm text-destructive">{unlockErrorMessage}</p>
          )}

          {unlockMutation.isPending ? (
            <LoadingSpinner text="Unlocking wallet..." />
          ) : (
            <Button type="submit" className="w-full" disabled={!password}>
              Unlock
            </Button>
          )}
        </form>
      </>
    </AppModal>
  )
}
