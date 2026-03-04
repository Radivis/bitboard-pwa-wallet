import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import { useSessionStore, startAutoLockTimer } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { getDatabase, ensureMigrated, loadWalletSecrets } from '@/db'
import { getEsploraUrl, toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet-utils'

interface WalletUnlockProps {
  walletName?: string
}

export function WalletUnlock({ walletName }: WalletUnlockProps) {
  const [password, setPassword] = useState('')

  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const networkMode = useWalletStore((s) => s.networkMode)
  const setWalletStatus = useWalletStore((s) => s.setWalletStatus)
  const setBalance = useWalletStore((s) => s.setBalance)
  const setTransactions = useWalletStore((s) => s.setTransactions)
  const setSessionPassword = useSessionStore((s) => s.setPassword)

  const loadWallet = useCryptoStore((s) => s.loadWallet)
  const syncWallet = useCryptoStore((s) => s.syncWallet)
  const getBalance = useCryptoStore((s) => s.getBalance)
  const getTransactionList = useCryptoStore((s) => s.getTransactionList)

  const unlockMutation = useMutation({
    mutationFn: async (walletPassword: string) => {
      if (!activeWalletId) throw new Error('No active wallet')

      await ensureMigrated()
      const db = getDatabase()
      const secrets = await loadWalletSecrets(db, walletPassword, activeWalletId)

      await loadWallet(
        secrets.externalDescriptor,
        secrets.internalDescriptor,
        toBitcoinNetwork(networkMode),
        secrets.changeSet,
      )

      setSessionPassword(walletPassword)
      setWalletStatus('unlocked')

      startAutoLockTimer(() => {
        useWalletStore.getState().lockWallet()
      })

      try {
        const customUrl = await loadCustomEsploraUrl(networkMode)
        const esploraUrl = getEsploraUrl(networkMode, customUrl)
        await syncWallet(esploraUrl)

        const balance = await getBalance()
        const txs = await getTransactionList()
        setBalance(balance)
        setTransactions(txs)
      } catch {
        toast.error('Sync failed — wallet unlocked but data may be stale')
      }
    },
    onError: () => {
      toast.error('Wrong password or corrupted wallet data')
    },
  })

  return (
    <Dialog open modal>
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
