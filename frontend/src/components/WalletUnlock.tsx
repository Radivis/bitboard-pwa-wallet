import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
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
import { LoadingSpinner } from '@/components/LoadingSpinner'
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
}

export function WalletUnlock({ walletName }: WalletUnlockProps) {
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { data: wallets } = useWallets()

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const setSessionPassword = useSessionStore((s) => s.setPassword)

  const handleClose = () => {
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
          onSyncError: (err) =>
            toast.error(
              errorMessage(err) || 'Sync failed — wallet unlocked but data may be stale',
            ),
        })
      }
    },
    onError: () => {
      toast.error('Wrong password or corrupted wallet data')
    },
  })

  return (
    <Dialog open modal onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Unlock Wallet
          </DialogTitle>
          <DialogDescription>
            {walletName
              ? `Enter your password to unlock "${walletName}".`
              : 'Enter your password to unlock your wallet.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            unlockMutation.mutate(password)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="unlock-password">Password</Label>
            <Input
              id="unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your wallet password"
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
      </DialogContent>
    </Dialog>
  )
}
