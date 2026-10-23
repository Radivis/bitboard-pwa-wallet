import type { ComponentProps } from 'react'
import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ScanQrCode } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { PageHeader } from '@/components/PageHeader'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_SEND_PAYMENT_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { SendLightningWalletPicker } from '@/components/wallet/send/SendLightningWalletPicker'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { DesignBanner } from '@/components/design/DesignBanner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'
import { MAX_BOLT11_PAYMENT_REQUEST_LENGTH } from '@/lib/lightning/lightning-input-limits'
import { isLightningPayloadLengthOk } from '@/lib/lightning/send-flow-validation'
import {
  sendRecipientFieldLabel,
  sendRecipientFormatErrorMessage,
  sendRecipientPlaceholder,
} from '@/lib/bark/send-flow-validation'
import { amountInputPlaceholderForUnit } from '@/lib/wallet/bitcoin-display-unit'
import {
  bolt11SignetFamilyConfirmationText,
  isValidBolt11Invoice,
} from '@/lib/lightning/lightning-utils'
import type { SendAmountUnit } from '@/stores/sendStore'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { BitcoinUnitSelect } from '@/components/BitcoinUnitSelect'
import { RecipientQrScanModal } from '@/components/wallet/send/RecipientQrScanModal'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import type { FiatCurrencyCode } from '@/lib/fiat/supported-fiat-currencies'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'

type LightningWalletPickerProps = ComponentProps<typeof SendLightningWalletPicker>

type LightningBalanceQuerySlice = {
  isPending: boolean
  isSuccess: boolean
}

type DecodedBolt11ForMemo = {
  description?: string | null
} | null

export function SendTransactionEntryCard({
  pageTitle,
  cardTitle,
  submitLabel,
  isLightningSendMode,
  isBarkSendMode,
  isArkadeSendMode,
  barkAvailable,
  barkSpendableSats,
  barkBalanceLoading,
  arkadeAvailable,
  arkadeBalanceSats,
  arkadeBalanceLoading,
  networkMode,
  recipient,
  onRecipientChange,
  recipientFormatValid,
  lightningAvailable,
  hasAnyLightningConnection,
  lightningRecipientOk,
  normalizedRecipient,
  bolt11NetworkMismatch,
  signetFamilyNeedsConfirmation,
  signetFamilyInvoiceConfirmed,
  onSignetFamilyInvoiceConfirmedChange,
  bolt11DecodeOk,
  matchingLightningConnections,
  balanceQueries,
  selectedLightningConnectionId,
  onSelectLightningConnection,
  decodedBolt11,
  needsUserLightningAmount,
  amountUnit,
  onAmountUnitChange,
  amount,
  onAmountChange,
  lightningPayAmountSats,
  selectedLnBalanceQuery,
  selectedLnBalanceSats,
  confirmedBalance,
  isLabWithNoBalance,
  feePresetSelection,
  presetSatPerVbByLabel,
  feeEstimatesRefreshing,
  customFeeRate,
  useCustomFee,
  onSelectFeePreset,
  onCustomFeeRateChange,
  onUseCustomFeeChange,
  isPending,
  buildOrLabPreparing,
  canBuild,
  onSubmitBuild,
  onApplyScannedPayload,
  mainnetFiatMode,
  defaultFiatCurrency,
  btcPriceInFiat,
  fiatRatesLoading,
  parsedAmountSats,
  onFiatModeUserToggle,
}: {
  pageTitle: string
  cardTitle: string
  submitLabel: string
  isLightningSendMode: boolean
  isBarkSendMode: boolean
  isArkadeSendMode: boolean
  barkAvailable: boolean
  barkSpendableSats: number | null
  barkBalanceLoading: boolean
  arkadeAvailable: boolean
  arkadeBalanceSats: number | undefined
  arkadeBalanceLoading: boolean
  networkMode: NetworkMode
  recipient: string
  onRecipientChange: (value: string) => void
  recipientFormatValid: boolean
  lightningAvailable: boolean
  hasAnyLightningConnection: boolean
  lightningRecipientOk: boolean
  normalizedRecipient: string
  bolt11NetworkMismatch: boolean
  signetFamilyNeedsConfirmation: boolean
  signetFamilyInvoiceConfirmed: boolean
  onSignetFamilyInvoiceConfirmedChange: (confirmed: boolean) => void
  bolt11DecodeOk: boolean
  matchingLightningConnections: LightningWalletPickerProps['connectedLightningWallets']
  balanceQueries: LightningWalletPickerProps['balanceQueries']
  selectedLightningConnectionId: string | null
  onSelectLightningConnection: (id: string) => void
  decodedBolt11: DecodedBolt11ForMemo
  needsUserLightningAmount: boolean
  amountUnit: SendAmountUnit
  onAmountUnitChange: (unit: SendAmountUnit) => void
  amount: string
  onAmountChange: (value: string, opts: { fromUser: boolean }) => void
  lightningPayAmountSats: number
  selectedLnBalanceQuery: LightningBalanceQuerySlice | null | undefined
  selectedLnBalanceSats: number | undefined
  confirmedBalance: number
  isLabWithNoBalance: boolean
  feePresetSelection: import('@/lib/esplora/esplora-fee-estimates').SendFeePresetLabel
  presetSatPerVbByLabel: Record<
    import('@/lib/esplora/esplora-fee-estimates').SendFeePresetLabel,
    number
  >
  feeEstimatesRefreshing: boolean
  customFeeRate: string
  useCustomFee: boolean
  onSelectFeePreset: (
    preset: import('@/lib/esplora/esplora-fee-estimates').SendFeePresetLabel,
    rateSatPerVb: number,
  ) => void
  onCustomFeeRateChange: (customFeeRate: string) => void
  onUseCustomFeeChange: (useCustomFee: boolean) => void
  isPending: boolean
  buildOrLabPreparing: boolean
  canBuild: boolean
  onSubmitBuild: () => void | Promise<void>
  onApplyScannedPayload: (raw: string) => void
  /** Mainnet && persisted fiat denomination mode. */
  mainnetFiatMode: boolean
  defaultFiatCurrency: FiatCurrencyCode
  btcPriceInFiat: number | null | undefined
  fiatRatesLoading: boolean
  /** Parsed sats from the amount field (fiat or BTC) for readonly BTC / validation display. */
  parsedAmountSats: number
  onFiatModeUserToggle?: (nextFiatMode: boolean) => void
}) {
  const [recipientScanOpen, setRecipientScanOpen] = useState(false)
  const submitInFlightRef = useRef(false)
  const hasUsableFiatSpot = isUsableBtcSpotPriceInFiat(btcPriceInFiat)
  const showSubmitSpinner =
    buildOrLabPreparing ||
    (isPending && (isBarkSendMode || isArkadeSendMode || isLightningSendMode))

  const arkadeSpendableSats = arkadeBalanceSats ?? 0
  const hideEditableAmountForZeroMainnet =
    networkMode === 'mainnet' &&
    !isLabWithNoBalance &&
    ((!isLightningSendMode &&
      !isBarkSendMode &&
      !isArkadeSendMode &&
      confirmedBalance <= 0) ||
      (isBarkSendMode && !barkBalanceLoading && (barkSpendableSats ?? 0) <= 0) ||
      (isArkadeSendMode && !arkadeBalanceLoading && arkadeSpendableSats <= 0) ||
      (isLightningSendMode &&
        needsUserLightningAmount &&
        selectedLnBalanceQuery?.isSuccess === true &&
        (selectedLnBalanceSats ?? 0) <= 0))

  const showMainnetZeroBalanceWarning =
    hideEditableAmountForZeroMainnet &&
    (needsUserLightningAmount ||
      (!isLightningSendMode && !isBarkSendMode && !isArkadeSendMode) ||
      isBarkSendMode ||
      isArkadeSendMode)

  const showBip11WithZeroBalance =
    hideEditableAmountForZeroMainnet &&
    isLightningSendMode &&
    !needsUserLightningAmount

  const useFiatAmountField =
    mainnetFiatMode &&
    hasUsableFiatSpot &&
    !hideEditableAmountForZeroMainnet &&
    (needsUserLightningAmount || !isLightningSendMode)

  const showFiatLayout = mainnetFiatMode && hasUsableFiatSpot

  function spendableAmountRows(balanceSats: number) {
    return (
      <FiatBtcAmountDisplay
        amountSats={balanceSats}
        showFiatLayout={showFiatLayout}
        btcPriceInFiat={btcPriceInFiat}
        currency={defaultFiatCurrency}
        isDetail
        rateLoading={fiatRatesLoading}
        className="inline text-muted-foreground"
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle} icon={ArrowUpRight} />

      {networkMode === 'mainnet' ? (
        <BitcoinFiatDenominationSwitch
          disabled={isPending}
          onFiatModeChange={onFiatModeUserToggle}
        />
      ) : null}

      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            {isArkadeSendMode ? (
              <InfomodeWrapper
                infoId={ARKADE_INFOMODE_IDS.sendPayment}
                infoTitle={ARKADE_SEND_PAYMENT_INFOMODE.title}
                infoText={ARKADE_SEND_PAYMENT_INFOMODE.text}
                as="span"
              >
                {cardTitle}
              </InfomodeWrapper>
            ) : (
              cardTitle
            )}
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canBuild || isPending || submitInFlightRef.current) return
              submitInFlightRef.current = true
              void Promise.resolve(onSubmitBuild()).finally(() => {
                submitInFlightRef.current = false
              })
            }}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="recipient-address">
                  {sendRecipientFieldLabel({
                    isLightningSendMode,
                    isBarkSendMode,
                    isArkadeSendMode,
                  })}
                </Label>
                <DesignButton
                  type="button"
                  appearance="secondary"
                  className="shrink-0"
                  disabled={isPending}
                  onClick={() => setRecipientScanOpen(true)}
                  icon={<ScanQrCode aria-hidden />}
                >
                  Scan QR code
                </DesignButton>
              </div>
              <DesignInput
                id="recipient-address"
                value={recipient}
                onChange={(e) => onRecipientChange(e.target.value)}
                placeholder={sendRecipientPlaceholder({
                  isBarkSendMode,
                  isArkadeSendMode,
                  lightningAvailable,
                  arkadeAvailable,
                  barkAvailable,
                  networkMode,
                })}
                disabled={isPending}
              />
              {recipient && !recipientFormatValid && (
                <p className="text-xs text-destructive">
                  {sendRecipientFormatErrorMessage({
                    isLightningSendMode,
                    isArkadeSendMode,
                    barkAvailable,
                    arkadeAvailable,
                    lightningAvailable,
                    networkMode,
                  })}
                </p>
              )}
              {recipient && isLightningSendMode && !lightningRecipientOk && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {hasAnyLightningConnection ? (
                    <>
                      No Lightning wallet for {NETWORK_LABELS[networkMode]}. Connect
                      one for this network in{' '}
                      <Link to="/wallet/management" className="underline">
                        Management
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      No Lightning wallet connected. Connect one in{' '}
                      <Link to="/wallet/management" className="underline">
                        Management
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}
              {isLightningSendMode &&
                signetFamilyNeedsConfirmation &&
                !bolt11NetworkMismatch && (
                  <div className="flex gap-3 rounded-md border border-border p-3">
                    <input
                      id="bolt11-signet-family-confirm"
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                      checked={signetFamilyInvoiceConfirmed}
                      onChange={(event) =>
                        onSignetFamilyInvoiceConfirmedChange(event.target.checked)
                      }
                    />
                    <Label
                      htmlFor="bolt11-signet-family-confirm"
                      className="cursor-pointer text-xs font-normal"
                    >
                      {bolt11SignetFamilyConfirmationText(networkMode)}
                    </Label>
                  </div>
                )}
              {isLightningSendMode &&
                isValidBolt11Invoice(normalizedRecipient) &&
                bolt11NetworkMismatch && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This invoice is for a different Bitcoin network than your
                    current mode. Switch network in{' '}
                    <Link to="/settings" className="font-medium underline">
                      Settings
                    </Link>
                    .
                  </p>
                )}
              {isLightningSendMode &&
                isValidBolt11Invoice(normalizedRecipient) &&
                !bolt11DecodeOk && (
                  <p className="text-xs text-destructive">
                    Could not read this BOLT11 invoice. Check the payment request
                    and try again.
                  </p>
                )}
              {isLightningSendMode &&
                !isLightningPayloadLengthOk(normalizedRecipient) && (
                <p className="text-xs text-destructive">
                  Payment request is too long (
                  {MAX_BOLT11_PAYMENT_REQUEST_LENGTH} characters max).
                </p>
              )}
            </div>

            <RecipientQrScanModal
              isOpen={recipientScanOpen}
              onOpenChange={setRecipientScanOpen}
              onScanned={onApplyScannedPayload}
            />

            {isLightningSendMode && (
              <SendLightningWalletPicker
                connectedLightningWallets={matchingLightningConnections}
                balanceQueries={balanceQueries}
                selectedConnectionId={selectedLightningConnectionId}
                onSelectConnection={onSelectLightningConnection}
                disabled={isPending}
              />
            )}

            {isLightningSendMode &&
              decodedBolt11?.description != null &&
              decodedBolt11.description.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Memo: </span>
                  {decodedBolt11.description}
                </p>
              )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="send-amount">
                  {needsUserLightningAmount
                    ? 'Amount'
                    : isLightningSendMode && !needsUserLightningAmount
                      ? 'Amount (from invoice)'
                      : 'Amount'}
                </Label>
                {(needsUserLightningAmount ||
                  (!isLightningSendMode && !isBarkSendMode && !isArkadeSendMode) ||
                  isBarkSendMode) &&
                  !useFiatAmountField && (
                    <BitcoinUnitSelect
                      value={amountUnit}
                      onChange={onAmountUnitChange}
                      disabled={isPending}
                      aria-label="Unit for amount entry"
                    />
                  )}
              </div>

              {showMainnetZeroBalanceWarning ? (
                <DesignBanner
                  role="alert"
                  status="warning"
                  title="No spendable balance"
                  description="You cannot send on this network until you have funds. Receive Bitcoin first, then enter an amount here."
                />
              ) : isLightningSendMode && !needsUserLightningAmount ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  <FiatBtcAmountDisplay
                    amountSats={lightningPayAmountSats}
                    showFiatLayout={showFiatLayout}
                    btcPriceInFiat={btcPriceInFiat}
                    currency={defaultFiatCurrency}
                    isDetail
                    size="sm"
                    rateLoading={fiatRatesLoading}
                  />
                  {showBip11WithZeroBalance ? (
                    <DesignBanner
                      role="alert"
                      status="warning"
                      className="mt-2"
                      title="Not enough balance to pay this invoice. Fund your wallet first."
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  <DesignInput
                    id="send-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) =>
                      onAmountChange(e.target.value, { fromUser: true })
                    }
                    placeholder={
                      useFiatAmountField
                        ? fiatAmountInputPlaceholder(defaultFiatCurrency)
                        : amountInputPlaceholderForUnit(amountUnit)
                    }
                    disabled={isPending}
                  />
                  {mainnetFiatMode && useFiatAmountField && hasUsableFiatSpot && (
                      <p className="text-sm text-muted-foreground">
                        <span className="mr-1">≈</span>
                        <BitcoinAmountDisplay
                          amountSats={parsedAmountSats}
                          size="sm"
                          className="inline"
                          allowUnitToggle={false}
                        />
                      </p>
                    )}
                  {mainnetFiatMode && useFiatAmountField && !fiatRatesLoading && (
                    <>
                      {!hasUsableFiatSpot ? (
                        <p className="text-xs text-destructive">
                          Exchange rate unavailable. Check your connection or rate
                          service in Settings.
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              )}
              <div className="text-xs text-muted-foreground">
                {isLightningSendMode ? (
                  <>
                    Lightning wallet:{' '}
                    {selectedLnBalanceQuery?.isPending ? (
                      'Loading balance…'
                    ) : selectedLnBalanceQuery?.isSuccess ? (
                      spendableAmountRows(selectedLnBalanceSats ?? 0)
                    ) : (
                      '—'
                    )}
                  </>
                ) : isBarkSendMode ? (
                  <>
                    Bark balance:{' '}
                    <span data-testid="send-bark-balance">
                      {barkBalanceLoading ? (
                        'Loading balance…'
                      ) : barkSpendableSats == null ? (
                        'Sync Bark before sending'
                      ) : (
                        spendableAmountRows(barkSpendableSats)
                      )}
                    </span>
                  </>
                ) : isArkadeSendMode ? (
                  <>
                    Arkade balance:{' '}
                    {arkadeBalanceLoading ? (
                      'Loading balance…'
                    ) : (
                      spendableAmountRows(arkadeSpendableSats)
                    )}
                  </>
                ) : (
                  <>
                    Available: {spendableAmountRows(confirmedBalance)}
                  </>
                )}
              </div>
              {isLabWithNoBalance &&
                !isLightningSendMode &&
                !isBarkSendMode &&
                !isArkadeSendMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No balance. Mine blocks or make a transaction to your wallet in
                  the lab.
                </p>
              )}
            </div>

            {!isLightningSendMode && !isBarkSendMode && !isArkadeSendMode && (
              <SendOnChainFeeSection
                feePresetSelection={feePresetSelection}
                presetSatPerVbByLabel={presetSatPerVbByLabel}
                feeEstimatesRefreshing={feeEstimatesRefreshing}
                customFeeRate={customFeeRate}
                useCustomFee={useCustomFee}
                isPending={isPending}
                onSelectPreset={onSelectFeePreset}
                setCustomFeeRate={onCustomFeeRateChange}
                onSelectCustomMode={() => onUseCustomFeeChange(true)}
              />
            )}

            {showSubmitSpinner ? (
              <LoadingSpinner
                text={
                  isBarkSendMode
                    ? 'Sending Bark payment...'
                    : isArkadeSendMode
                      ? 'Sending Arkade payment...'
                      : isLightningSendMode
                      ? 'Sending Lightning payment...'
                      : networkMode === 'lab'
                        ? 'Preparing transaction...'
                        : 'Building transaction...'
                }
              />
            ) : (
              <DesignButton type="submit" className="w-full" disabled={!canBuild || isPending}>
                {submitLabel}
              </DesignButton>
            )}
          </form>
        </DesignCardContent>
      </DesignCard>
    </div>
  )
}
