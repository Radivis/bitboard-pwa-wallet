import { useCallback, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { QrCode, Copy, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useWalletStore } from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { updateWalletChangeset } from '@/lib/wallet-utils'

export const Route = createFileRoute('/receive')({
  component: ReceivePage,
})

export function ReceivePage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const addressType = useWalletStore((s) => s.addressType)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const password = useSessionStore((s) => s.password)
  const getNewAddress = useCryptoStore((s) => s.getNewAddress)
  const exportChangeset = useCryptoStore((s) => s.exportChangeset)

  useEffect(() => {
    if (!currentAddress && walletStatus === 'unlocked') {
      loadAddress()
    }

    async function loadAddress() {
      try {
        const address = await getNewAddress()
        setCurrentAddress(address)
      } catch {
        toast.error('Failed to generate address')
      }
    }
  }, [currentAddress, walletStatus, getNewAddress, setCurrentAddress])

  const handleNewAddress = useCallback(async () => {
    try {
      const address = await getNewAddress()
      setCurrentAddress(address)

      if (password && activeWalletId) {
        const changeset = await exportChangeset()
        await updateWalletChangeset(password, activeWalletId, changeset)
      }

      toast.success('New address generated')
    } catch {
      toast.error('Failed to generate new address')
    }
  }, [getNewAddress, setCurrentAddress, exportChangeset, password, activeWalletId])

  const handleCopy = useCallback(async () => {
    if (!currentAddress) return
    try {
      await navigator.clipboard.writeText(currentAddress)
      toast.success('Address copied to clipboard')
    } catch {
      toast.error('Failed to copy address')
    }
  }, [currentAddress])

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (walletStatus === 'locked') {
    return <WalletUnlock />
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Receive Bitcoin</h2>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code
            </CardTitle>
            <Badge variant="outline">
              {addressType === 'taproot' ? 'Taproot (BIP86)' : 'SegWit (BIP84)'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            {currentAddress ? (
              <div className="rounded-lg bg-white p-4">
                <QRCodeSVG
                  value={`bitcoin:${currentAddress}`}
                  size={256}
                  level="M"
                  imageSettings={{
                    src: '/bitboard-icon.svg',
                    height: 48,
                    width: 48,
                    excavate: true,
                  }}
                />
              </div>
            ) : (
              <LoadingSpinner text="Generating address..." />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receiving Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-sm">
              {currentAddress || 'Generating...'}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              disabled={!currentAddress}
              aria-label="Copy address"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleNewAddress}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate New Address
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
