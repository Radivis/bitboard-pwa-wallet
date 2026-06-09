import { Link } from '@tanstack/react-router'
import { Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { ArkadeAddressInfomodeContent } from '@/components/arkade/infomode/ArkadeAddressInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import {
  useArkadeAddressQuery,
  useArkadeBalanceQuery,
  useArkadeNewAddressMutation,
} from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { useWalletStore } from '@/stores/walletStore'

export function ArkadeReceive() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const storeReceiveAddress = useWalletStore((walletState) => walletState.arkadeReceiveAddress)
  const addressQuery = useArkadeAddressQuery()
  const newAddressMutation = useArkadeNewAddressMutation()
  // Poll balance (and run WASM key discovery) while the user waits on Receive.
  useArkadeBalanceQuery()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <p className="text-sm text-muted-foreground">
        Enable Arkade under Settings → Features and select a supported network (mainnet
        or signet).{' '}
        <Link to="/settings" className="text-primary underline-offset-4 hover:underline">
          Open settings
        </Link>
      </p>
    )
  }

  const address = storeReceiveAddress ?? addressQuery.data ?? ''
  const addressLoading =
    storeReceiveAddress == null &&
    (addressQuery.isLoading || (addressQuery.isFetching && address.length === 0))

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Arkade address copied')
    } catch {
      toast.error('Failed to copy address')
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            {addressLoading ? (
              <LoadingSpinner text="Loading address…" />
            ) : addressQuery.isError ? null : address ? (
              <div className="rounded-lg bg-white p-4">
                <QRCodeSVG
                  value={address}
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
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.receiveAddress}
              infoComponent={ArkadeAddressInfomodeContent}
              as="span"
            >
              Arkade receiving address
            </InfomodeWrapper>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addressQuery.isError ? (
            <p className="text-sm text-destructive">
              Could not load Arkade address. Unlock the wallet and check your network.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-sm">
                  {addressLoading ? 'Loading…' : address || 'Loading…'}
                </div>
                <Button
                  size="icon"
                  onClick={handleCopy}
                  disabled={!address}
                  aria-label="Copy address"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button
                className="w-full"
                disabled={newAddressMutation.isPending || !address}
                onClick={() => newAddressMutation.mutate()}
              >
                {newAddressMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Generate New Address
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
