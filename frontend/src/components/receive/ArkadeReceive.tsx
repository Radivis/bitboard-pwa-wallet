import { Link } from '@tanstack/react-router'
import { Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { ArkadeAddressInfomodeContent } from '@/components/arkade/infomode/ArkadeAddressInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import {
  useArkadeAddressQuery,
  useArkadeBalanceQuery,
  useArkadeNewAddressMutation,
} from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function ArkadeReceive() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
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
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent>
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
        </DesignCardContent>
      </DesignCard>

      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle>
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.receiveAddress}
              infoComponent={ArkadeAddressInfomodeContent}
              as="span"
            >
              Arkade receiving address
            </InfomodeWrapper>
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent className="space-y-3">
          {addressQuery.isError ? (
            <p className="text-sm text-destructive">
              Could not load Arkade address. Unlock the wallet and check your network.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div
                  data-testid="arkade-receive-address"
                  className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-sm"
                >
                  {addressLoading ? 'Loading…' : address || 'Loading…'}
                </div>
                <DesignButton
                  onClick={handleCopy}
                  disabled={!address}
                  aria-label="Copy address"
                  icon={<Copy />}
                />
              </div>
              <DesignButton
                type="button"
                className="w-full"
                data-testid="arkade-generate-new-address"
                disabled={newAddressMutation.isPending || !address}
                onClick={() => newAddressMutation.mutate()}
                icon={
                  newAddressMutation.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw />
                  )
                }
              >
                Generate New Address
              </DesignButton>
            </>
          )}
        </DesignCardContent>
      </DesignCard>
    </>
  )
}
