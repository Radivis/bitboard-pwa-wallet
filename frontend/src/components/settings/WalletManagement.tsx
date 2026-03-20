import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWallets } from '@/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function WalletManagement() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lockAndPurgeSensitiveRuntimeState = useCryptoStore(
    (s) => s.lockAndPurgeSensitiveRuntimeState,
  )
  const { data: wallets } = useWallets()
  const hasMultipleWallets = (wallets?.length ?? 0) > 1

  if (!activeWalletId) return null

  const handleLockWallet = () => {
    lockAndPurgeSensitiveRuntimeState()
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
