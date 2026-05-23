import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { DeadLabEntityRecipientModal } from '@/components/lab/DeadLabEntityRecipientModal'
import { truncateAddress } from '@/lib/bitcoin-utils'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import { OnchainDustWarningReviewBanner } from '@/components/wallet/send/OnchainDustWarningReviewBanner'
import { ReviewInputUtxoList } from '@/components/wallet/send/ReviewInputUtxoList'
import type { AddressType, NetworkMode } from '@/stores/walletStore'
import type { OnchainDustWarning, SendAmountUnit } from '@/stores/sendStore'
import type { FiatCurrencyCode } from '@/lib/supported-fiat-currencies'
import { isUsableBtcSpotPriceInFiat } from '@/lib/is-usable-btc-spot-price-in-fiat'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

type DeadLabRecipientInfo = {
  displayName: string
  addressType: AddressType
} | null

function ReviewAmountValue({
  amountSats,
  mainnetFiatMode,
  hasUsableFiatSpot,
  btcPriceInFiat,
  defaultFiatCurrency,
  fiatRatesLoading,
}: {
  amountSats: number
  mainnetFiatMode: boolean
  hasUsableFiatSpot: boolean
  btcPriceInFiat: number | null | undefined
  defaultFiatCurrency: FiatCurrencyCode
  fiatRatesLoading: boolean
}) {
  if (mainnetFiatMode && hasUsableFiatSpot) {
    return (
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
    )
  }

  return <BitcoinAmountDisplay amountSats={amountSats} size="sm" />
}

function ReviewAmountRow({
  label,
  amountSats,
  mainnetFiatMode,
  hasUsableFiatSpot,
  btcPriceInFiat,
  defaultFiatCurrency,
  fiatRatesLoading,
}: {
  label: string
  amountSats: number
  mainnetFiatMode: boolean
  hasUsableFiatSpot: boolean
  btcPriceInFiat: number | null | undefined
  defaultFiatCurrency: FiatCurrencyCode
  fiatRatesLoading: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <ReviewAmountValue
          amountSats={amountSats}
          mainnetFiatMode={mainnetFiatMode}
          hasUsableFiatSpot={hasUsableFiatSpot}
          btcPriceInFiat={btcPriceInFiat}
          defaultFiatCurrency={defaultFiatCurrency}
          fiatRatesLoading={fiatRatesLoading}
        />
      </span>
    </div>
  )
}

export function SendTransactionReviewStep({
  networkMode,
  recipient,
  amountSats,
  effectiveFeeRate,
  reviewFeeSats,
  reviewChangeSats,
  reviewInputUtxos,
  spendableBalanceSats,
  totalBalanceSats,
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
  reviewFeeSats: number | null
  reviewChangeSats: number | null
  reviewInputUtxos: ReviewInputUtxo[] | null
  spendableBalanceSats: number
  totalBalanceSats: number
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
  const [showInputUtxos, setShowInputUtxos] = useState(false)
  const hasUsableFiatSpot = isUsableBtcSpotPriceInFiat(btcPriceInFiat)
  const showOnchainFeeSummary =
    !isLightningSendMode && reviewFeeSats != null
  const inputUtxos = reviewInputUtxos ?? []
  const totalInputSats = inputUtxos.reduce(
    (sum, utxo) => sum + utxo.amountSats,
    0,
  )
  const totalDeductedSats = amountSats + (reviewFeeSats ?? 0)
  const amountRemainingSats = Math.max(0, totalBalanceSats - totalDeductedSats)
  const immediatelySpendableRemainingSats = Math.max(
    0,
    spendableBalanceSats - totalInputSats,
  )
  const changeSats = reviewChangeSats ?? 0

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
            <ReviewAmountRow
              label="Amount"
              amountSats={amountSats}
              mainnetFiatMode={mainnetFiatMode}
              hasUsableFiatSpot={hasUsableFiatSpot}
              btcPriceInFiat={btcPriceInFiat}
              defaultFiatCurrency={defaultFiatCurrency}
              fiatRatesLoading={fiatRatesLoading}
            />
            {!isLightningSendMode && (
              <OnchainDustWarningReviewBanner
                warning={onchainDustWarning}
                amountUnit={amountUnit}
              />
            )}
            {!isLightningSendMode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee rate</span>
                <span>{effectiveFeeRate.toFixed(2)} sat/vB</span>
              </div>
            )}
            {showOnchainFeeSummary ? (
              <>
                <ReviewAmountRow
                  label="Fee"
                  amountSats={reviewFeeSats}
                  mainnetFiatMode={mainnetFiatMode}
                  hasUsableFiatSpot={hasUsableFiatSpot}
                  btcPriceInFiat={btcPriceInFiat}
                  defaultFiatCurrency={defaultFiatCurrency}
                  fiatRatesLoading={fiatRatesLoading}
                />
                <ReviewAmountRow
                  label="Total deducted"
                  amountSats={totalDeductedSats}
                  mainnetFiatMode={mainnetFiatMode}
                  hasUsableFiatSpot={hasUsableFiatSpot}
                  btcPriceInFiat={btcPriceInFiat}
                  defaultFiatCurrency={defaultFiatCurrency}
                  fiatRatesLoading={fiatRatesLoading}
                />
                <ReviewAmountRow
                  label="Amount remaining"
                  amountSats={amountRemainingSats}
                  mainnetFiatMode={mainnetFiatMode}
                  hasUsableFiatSpot={hasUsableFiatSpot}
                  btcPriceInFiat={btcPriceInFiat}
                  defaultFiatCurrency={defaultFiatCurrency}
                  fiatRatesLoading={fiatRatesLoading}
                />
                <ReviewAmountRow
                  label="Change"
                  amountSats={changeSats}
                  mainnetFiatMode={mainnetFiatMode}
                  hasUsableFiatSpot={hasUsableFiatSpot}
                  btcPriceInFiat={btcPriceInFiat}
                  defaultFiatCurrency={defaultFiatCurrency}
                  fiatRatesLoading={fiatRatesLoading}
                />
                <ReviewAmountRow
                  label="Immediately spendable remaining"
                  amountSats={immediatelySpendableRemainingSats}
                  mainnetFiatMode={mainnetFiatMode}
                  hasUsableFiatSpot={hasUsableFiatSpot}
                  btcPriceInFiat={btcPriceInFiat}
                  defaultFiatCurrency={defaultFiatCurrency}
                  fiatRatesLoading={fiatRatesLoading}
                />
                {inputUtxos.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full px-0 text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setShowInputUtxos((open) => !open)}
                    >
                      {showInputUtxos
                        ? 'Hide UTXOs to be used'
                        : 'Show UTXOs to be used'}
                    </Button>
                    {showInputUtxos ? (
                      <ReviewInputUtxoList inputUtxos={inputUtxos} />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
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
