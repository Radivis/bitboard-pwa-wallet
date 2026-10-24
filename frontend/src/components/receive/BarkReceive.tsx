import { Copy, Loader2, QrCode, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import {
  useBarkReceiveAddressQuery,
  useBarkRevealReceiveAddressMutation,
} from '@/hooks/useBarkReceiveQueries'

export function BarkReceive() {
  const snapshot = useBarkLoadLifecycleSnapshot()
  const addressQuery = useBarkReceiveAddressQuery()
  const revealMutation = useBarkRevealReceiveAddressMutation()

  const indexMissing = snapshot.loadPhase === 'loaded' && snapshot.receiveKeyIndex == null
  const address = addressQuery.data ?? ''
  const addressLoading =
    !indexMissing &&
    snapshot.loadPhase !== 'load-error' &&
    (snapshot.loadPhase === 'loading' ||
      addressQuery.isLoading ||
      (addressQuery.isFetching && address.length === 0))
  const showAddressError = indexMissing || snapshot.loadPhase === 'load-error' || addressQuery.isError

  const handleCopy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Bark address copied')
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
            ) : showAddressError ? null : address ? (
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
              infoId="bark-receive-address"
              infoTitle="Bark receiving address"
              infoText="This is a Second public Signet Ark address (tark…). It is separate from your on-chain Bitcoin address and from Arkade. Showing it does not create a new one. Generate new address is the control that advances to the next Bark key."
              as="span"
            >
              Bark receiving address
            </InfomodeWrapper>
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent className="space-y-3">
          {showAddressError ? (
            <p className="text-sm text-destructive">
              {snapshot.loadPhase === 'load-error' && snapshot.errorMessage
                ? snapshot.errorMessage
                : 'Could not load Bark address.'}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <div
                data-testid="bark-receive-address"
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
          )}
          <DesignButton
            type="button"
            className="w-full"
            data-testid="bark-generate-new-address"
            disabled={
              revealMutation.isPending || !address || indexMissing || showAddressError
            }
            onClick={() => revealMutation.mutate()}
            icon={
              revealMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw />
              )
            }
          >
            Generate New Address
          </DesignButton>
        </DesignCardContent>
      </DesignCard>
    </>
  )
}
