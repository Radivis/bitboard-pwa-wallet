import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWallets } from '@/db'
import { clearAutoLockTimer } from '@/stores/sessionStore'
import { resetSecretsChannel } from '@/workers/secrets-channel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function WalletManagement() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lockWallet = useWalletStore((s) => s.lockWallet)
  const terminateWorker = useCryptoStore((s) => s.terminateWorker)
  const clearSession = useSessionStore((s) => s.clear)
  const { data: wallets } = useWallets()
  const hasMultipleWallets = (wallets?.length ?? 0) > 1

  if (!activeWalletId) return null

  const handleLockWallet = () => {
    lockWallet()
    terminateWorker()
    resetSecretsChannel()
    clearSession()
    clearAutoLockTimer()
    toast.success('Wallet locked')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Wallet Management
        </CardTitle>
        <CardDescription>
          Lock your wallet to require a password for the next access, or switch
          between multiple wallets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate({ to: '/setup' })}>
            Add Wallet
          </Button>
          {hasMultipleWallets && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/wallets' })}
            >
              Switch Wallet
            </Button>
          )}
          {walletStatus === 'unlocked' && (
            <Button variant="outline" onClick={handleLockWallet}>
              Lock Wallet
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
