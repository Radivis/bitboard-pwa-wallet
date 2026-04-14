import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { QrCode, Copy, RefreshCw, ArrowDownLeft } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import {
  AddressType,
  selectCommittedNetworkMode,
  useWalletStore,
  type NetworkMode,
} from '@/stores/walletStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { useFeatureStore } from '@/stores/featureStore'
import { updateWalletChangeset } from '@/lib/wallet-utils'
import { isLightningSupported } from '@/lib/lightning-utils'
import { ReceiveModeToggle, type ReceiveMode } from '@/components/receive/ReceiveModeToggle'
import { LightningReceive } from '@/components/receive/LightningReceive'
import { ReceiveMainnetDemoWarningModal } from '@/components/receive/ReceiveMainnetDemoWarningModal'
import { FaucetLinker } from '@/components/receive/FaucetLinker'

export const Route = createFileRoute('/wallet/receive')({
  component: ReceivePage,
})

export function ReceivePage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const addressType = useWalletStore((s) => s.addressType)
  const networkMode = useWalletStore((s) => s.networkMode)
  const setCurrentAddress = useWalletStore((s) => s.setCurrentAddress)
  const password = useSessionStore((s) => s.password)
  const getNewAddress = useCryptoStore((s) => s.getNewAddress)
  const exportChangeset = useCryptoStore((s) => s.exportChangeset)
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  const committedNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const [mainnetDemoDismissed, setMainnetDemoDismissed] = useState(false)
  const previousCommittedNetworkModeRef = useRef<NetworkMode | null>(null)

  const showLightningToggle = lightningEnabled && isLightningSupported(networkMode)
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('bitcoin')

  useEffect(() => {
    const previous = previousCommittedNetworkModeRef.current
    previousCommittedNetworkModeRef.current = committedNetworkMode
    if (
      committedNetworkMode === 'mainnet' &&
      previous !== 'mainnet'
    ) {
      setMainnetDemoDismissed(false)
    }
  }, [committedNetworkMode])

  useEffect(() => {
    if (!currentAddress && (walletStatus === 'unlocked' || walletStatus === 'syncing')) {
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
        await updateWalletChangeset({
          password,
          walletId: activeWalletId,
          changesetJson: changeset,
        })
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

  if (walletStatus !== 'unlocked' && walletStatus !== 'syncing') {
    return <WalletUnlockOrNearZeroLoading />
  }

  const showMainnetDemoModal =
    committedNetworkMode === 'mainnet' && !mainnetDemoDismissed
  const mainnetDemoModal = (
    <ReceiveMainnetDemoWarningModal
      open={showMainnetDemoModal}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setMainnetDemoDismissed(true)
      }}
    />
  )

  if (showLightningToggle && receiveMode === 'lightning') {
    return (
      <>
        {mainnetDemoModal}
        <div className="space-y-6">
          <PageHeader title="Receive Lightning" icon={ArrowDownLeft} />
          <ReceiveModeToggle mode={receiveMode} onModeChange={setReceiveMode} />
          <LightningReceive />
        </div>
      </>
    )
  }

  return (
    <>
      {mainnetDemoModal}
      <div className="space-y-6">
      <PageHeader title="Receive Bitcoin" icon={ArrowDownLeft} />

      {showLightningToggle && (
        <ReceiveModeToggle mode={receiveMode} onModeChange={setReceiveMode} />
      )}

      <InfomodeWrapper
        infoId="receive-qr-code-card"
        infoTitle="QR code"
        infoText="This QR code only encodes the same receiving address you see below—usually as a bitcoin:… link—so someone can point a phone camera at it instead of typing. All mainstream mobile Bitcoin wallets today can scan this format and pre-fill a send screen with your address."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code
              </CardTitle>
              {segwitAddressesEnabled ? (
                <Badge variant="outline">
                  {addressType === AddressType.Taproot
                    ? 'Taproot (BIP86)'
                    : 'SegWit (BIP84)'}
                </Badge>
              ) : null}
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
                      src: '/bitboard-icon.png',
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
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="receive-receiving-address-card"
        infoTitle="Receiving address"
        infoText="The beginning of the string (the prefix) signals both the address type and which Bitcoin network it is for—mainnet and test networks use different conventions, and Taproot vs SegWit addresses look different by design. Under the hood your wallet is not inventing random strings: it derives each address in a fixed order from your single master key using standard HD-wallet rules. That means the same recovery phrase always regenerates the same sequence of addresses in any compatible wallet."
        className="rounded-xl"
      >
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
                size="icon"
                onClick={handleCopy}
                disabled={!currentAddress}
                aria-label="Copy address"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <InfomodeWrapper
              infoId="receive-generate-new-address-button"
              infoTitle="Generate new address"
              infoText="When you tap this, Bitboard advances an internal index and derives the next unused address from your wallet’s master key along the standard path for your address type (BIP86 for Taproot, BIP84 for SegWit). Nothing is “random” in the sense of losing it later: the new address is the next slot in a deterministic list, so your seed phrase can always recreate every address you have ever generated, in order. Older addresses you already shared still receive funds; generating a new one is mainly for privacy and for keeping track of separate payments."
            >
              <Button className="w-full" onClick={handleNewAddress}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate New Address
              </Button>
            </InfomodeWrapper>
          </CardContent>
        </Card>
      </InfomodeWrapper>

      <FaucetLinker />
    </div>
    </>
  )
}
