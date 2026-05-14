import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DeadLabEntityRecipientModal } from '@/components/lab/DeadLabEntityRecipientModal'
import { truncateAddress } from '@/lib/bitcoin-utils'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import { OnchainDustWarningReviewBanner } from '@/components/wallet/send/OnchainDustWarningReviewBanner'
import type { AddressType, NetworkMode } from '@/stores/walletStore'
import type { OnchainDustWarning, SendAmountUnit } from '@/stores/sendStore'
import type { FiatCurrencyCode } from '@/lib/supported-fiat-currencies'
import { isUsableBtcSpotPriceInFiat } from '@/lib/is-usable-btc-spot-price-in-fiat'

type DeadLabRecipientInfo = {
  displayName: string
  addressType: AddressType
} | null

export function SendTransactionReviewStep({
  networkMode,
  recipient,
  amountSats,
  effectiveFeeRate,
  onchainDustWarning,
  amountUnit,
  isLightningSendMode,
  isPending,
  deadLabRecipientInfo,
  deadLabRecipientModalOpen,
  onDeadLabRecipientModalOpenChange,
  onDeadLabRecipientCancel,
  onConfirmDeadLabRecipientSend,
  labSendPendingForDeadLabModal,
  onBack,
  onConfirmSend,
  labConfirmSendDisabled,
  mainnetFiatMode,
  defaultFiatCurrency,
  btcPriceInFiat,
  fiatRatesLoading,
}: {
  networkMode: NetworkMode
  recipient: string
  amountSats: number
  effectiveFeeRate: number
  onchainDustWarning: OnchainDustWarning | null
  amountUnit: SendAmountUnit
  isLightningSendMode: boolean
  isPending: boolean
  deadLabRecipientInfo: DeadLabRecipientInfo
  deadLabRecipientModalOpen: boolean
  onDeadLabRecipientModalOpenChange: (open: boolean) => void
  onDeadLabRecipientCancel: () => void
  onConfirmDeadLabRecipientSend: () => void
  labSendPendingForDeadLabModal: boolean
  onBack: () => void
  onConfirmSend: () => void
  labConfirmSendDisabled: boolean
  mainnetFiatMode: boolean
  defaultFiatCurrency: FiatCurrencyCode
  btcPriceInFiat: number | null | undefined
  fiatRatesLoading: boolean
}) {
  const hasUsableFiatSpot = isUsableBtcSpotPriceInFiat(btcPriceInFiat)

  return (
    <div className="space-y-6">
      {networkMode === 'lab' && deadLabRecipientInfo != null ? (
        <DeadLabEntityRecipientModal
          open={deadLabRecipientModalOpen}
          onOpenChange={onDeadLabRecipientModalOpenChange}
          onCancel={onDeadLabRecipientCancel}
          entityDisplayName={deadLabRecipientInfo.displayName}
          addressType={deadLabRecipientInfo.addressType}
          onConfirm={onConfirmDeadLabRecipientSend}
          isPending={labSendPendingForDeadLabModal}
        />
      ) : null}

      <PageHeader title="Review Transaction" icon={ArrowUpRight} />

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recipient</span>
              <span className="font-mono">{truncateAddress(recipient)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="text-right">
                {mainnetFiatMode && hasUsableFiatSpot ? (
                  <div className="flex flex-col items-end gap-1">
                    <FiatAmountDisplay
                      amountSats={amountSats}
                      btcPriceInFiat={btcPriceInFiat}
                      currency={defaultFiatCurrency}
                      size="sm"
                      rateLoading={fiatRatesLoading}
                    />
                    <BitcoinAmountDisplay
                      amountSats={amountSats}
                      size="sm"
                      allowUnitToggle={false}
                      className="text-muted-foreground"
                    />
                  </div>
                ) : (
                  <BitcoinAmountDisplay amountSats={amountSats} size="sm" />
                )}
              </span>
            </div>
            {!isLightningSendMode && (
              <OnchainDustWarningReviewBanner
                warning={onchainDustWarning}
                amountUnit={amountUnit}
              />
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee rate</span>
              <span>{effectiveFeeRate.toFixed(2)} sat/vB</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onBack}
              disabled={isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            {isPending ? (
              <div className="flex-1">
                <LoadingSpinner
                  text={
                    networkMode === 'lab'
                      ? 'Adding to mempool...'
                      : 'Broadcasting...'
                  }
                />
              </div>
            ) : (
              <Button
                className="flex-1"
                onClick={onConfirmSend}
                disabled={labConfirmSendDisabled}
              >
                Confirm and Send
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
