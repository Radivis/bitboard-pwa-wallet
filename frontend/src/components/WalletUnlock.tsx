import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { AppModal } from '@/components/AppModal'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWallets } from '@/db'
import { errorMessage } from '@/lib/utils'
import {
  loadDescriptorWalletAndSync,
  loadDescriptorWalletWithoutSync,
} from '@/lib/wallet-utils'

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

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const setSessionPassword = useSessionStore((s) => s.setPassword)

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

  const unlockMutation = useMutation({
    mutationFn: async (walletPassword: string) => {
      if (!activeWalletId) throw new Error('No active wallet')

      setSessionPassword(walletPassword)
      if (networkMode === 'lab') {
        await loadDescriptorWalletWithoutSync({
          password: walletPassword,
          walletId: activeWalletId,
          networkMode,
          addressType,
          accountId,
        })
      } else {
        await loadDescriptorWalletAndSync({
          password: walletPassword,
          walletId: activeWalletId,
          networkMode,
          addressType,
          accountId,
          awaitSync: false,
          onSyncError: (err) =>
            toast.error(
              errorMessage(err) || 'Sync failed — wallet unlocked but data may be stale',
            ),
        })
      }
    },
    onSuccess: () => {
      onUnlockSuccess?.()
    },
    onError: () => {
      toast.error('Wrong password or corrupted wallet data')
    },
  })

  return (
    <AppModal
      open
      modal
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
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Bitboard app password"
              disabled={unlockMutation.isPending}
              autoFocus
            />
          </div>

          {unlockMutation.isError && (
            <p className="text-sm text-destructive">
              Wrong password or corrupted wallet data
            </p>
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
