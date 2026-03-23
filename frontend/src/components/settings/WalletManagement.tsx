import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useWallets } from '@/db'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
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
          <InfomodeWrapper
            infoId="settings-add-wallet"
            infoTitle="Add wallet"
            infoText="Opens the setup flow so you can create a brand-new wallet or import another recovery phrase. Bitboard can store several wallets; each keeps its own records, and you can switch between them from the wallet list when you have more than one."
          >
            <Button variant="outline" onClick={() => navigate({ to: '/setup' })}>
              Add Wallet
            </Button>
          </InfomodeWrapper>
          {hasMultipleWallets && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/wallets' })}
            >
              Switch Wallet
            </Button>
          )}
          {walletStatus === 'unlocked' && (
            <InfomodeWrapper
              infoId="settings-lock-wallet"
              infoTitle="Lock wallet"
              infoText="Immediately clears sensitive keys from this app’s memory and returns you to a locked state. The next time you use the wallet you will enter your Bitboard password again—handy on a shared computer or when you walk away from the device."
            >
              <Button variant="outline" onClick={handleLockWallet}>
                Lock Wallet
              </Button>
            </InfomodeWrapper>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
