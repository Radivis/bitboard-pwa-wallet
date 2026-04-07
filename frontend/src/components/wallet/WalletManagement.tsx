import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useUpdateWallet, useWallet, useWallets } from '@/db'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_WALLET_NAME_LENGTH = 128

export function WalletManagement() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const lockAndPurgeSensitiveRuntimeState = useCryptoStore(
    (s) => s.lockAndPurgeSensitiveRuntimeState,
  )
  const { data: wallets } = useWallets()
  const { data: walletRow, isSuccess: walletRowLoaded } = useWallet(activeWalletId)
  const updateWallet = useUpdateWallet()
  const [draftName, setDraftName] = useState('')
  const hasMultipleWallets = (wallets?.length ?? 0) > 1

  useEffect(() => {
    if (walletRowLoaded && walletRow?.name !== undefined) {
      setDraftName(walletRow.name)
    }
  }, [activeWalletId, walletRowLoaded, walletRow?.name])

  if (!activeWalletId) return null

  const handleLockWallet = async () => {
    await lockAndPurgeSensitiveRuntimeState()
    toast.success('Wallet locked')
  }

  const trimmedDraft = draftName.trim()
  const storedName = (walletRow?.name ?? '').trim()
  const nameValid =
    trimmedDraft.length > 0 && trimmedDraft.length <= MAX_WALLET_NAME_LENGTH
  const nameChanged = trimmedDraft !== storedName

  const handleSaveWalletName = async () => {
    if (!nameValid) {
      if (trimmedDraft.length === 0) {
        toast.error('Enter a wallet name')
      } else {
        toast.error(`Name must be at most ${MAX_WALLET_NAME_LENGTH} characters`)
      }
      return
    }
    await updateWallet.mutateAsync({
      id: activeWalletId,
      changes: { name: trimmedDraft },
    })
    toast.success('Wallet name updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Wallet Management
        </CardTitle>
        <CardDescription>
          Lock your wallet to require your Bitboard app password for the next
          access, or switch between multiple wallets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <InfomodeWrapper
          infoId="wallet-rename"
          infoTitle="Wallet name"
          infoText="This label is only used inside Bitboard (for example in the header and wallet list). It is not sent to the Bitcoin network and does not affect your recovery phrase or addresses."
          className="space-y-2"
        >
          <Label htmlFor="wallet-display-name">Wallet name</Label>
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              id="wallet-display-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={MAX_WALLET_NAME_LENGTH}
              autoComplete="off"
              className="sm:flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!nameChanged || !nameValid || updateWallet.isPending}
              onClick={() => void handleSaveWalletName()}
            >
              Save name
            </Button>
          </div>
        </InfomodeWrapper>
        <div className="flex flex-wrap gap-2">
          <InfomodeWrapper
            infoId="wallet-add-wallet"
            infoTitle="Add wallet"
            infoText="Opens the setup flow so you can create a brand-new wallet or import another recovery phrase. Use the same Bitboard app password you already set—it encrypts every wallet on this device. If your session is locked, you will unlock first. You can switch between wallets from the wallet list when you have more than one."
          >
            <Button variant="outline" onClick={() => navigate({ to: '/setup' })}>
              Add Wallet
            </Button>
          </InfomodeWrapper>
          {hasMultipleWallets && (
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/wallet/wallets' })}
            >
              Switch Wallet
            </Button>
          )}
          {walletStatus === 'unlocked' && (
            <InfomodeWrapper
              infoId="wallet-lock-wallet"
              infoTitle="Lock wallet"
              infoText="Immediately clears sensitive keys from this app’s memory and returns you to a locked state. The next time you use Bitboard you will enter your app password again—handy on a shared computer or when you walk away from the device."
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
