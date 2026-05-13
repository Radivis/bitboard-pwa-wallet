import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowUpRight, ScanQrCode } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SendLightningWalletPicker } from '@/components/wallet/send/SendLightningWalletPicker'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'
import { MAX_BOLT11_PAYMENT_REQUEST_LENGTH } from '@/lib/lightning-input-limits'
import { amountInputPlaceholderForUnit } from '@/lib/bitcoin-display-unit'
import { isValidBolt11Invoice } from '@/lib/lightning-utils'
import type { SendAmountUnit } from '@/stores/sendStore'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { BitcoinUnitSelect } from '@/components/BitcoinUnitSelect'
import { RecipientQrScanModal } from '@/components/wallet/send/RecipientQrScanModal'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { FiatAmountDisplay } from '@/components/FiatAmountDisplay'
import type { SupportedDefaultFiatCurrency } from '@/lib/supported-fiat-currencies'
import { fiatAmountInputPlaceholder } from '@/lib/format-fiat-display'

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
  networkMode,
  recipient,
  onRecipientChange,
  recipientFormatValid,
  lightningAvailable,
  hasAnyLightningConnection,
  lightningRecipientOk,
  normalizedRecipient,
  bolt11NetworkMismatch,
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
  networkMode: NetworkMode
  recipient: string
  onRecipientChange: (value: string) => void
  recipientFormatValid: boolean
  lightningAvailable: boolean
  hasAnyLightningConnection: boolean
  lightningRecipientOk: boolean
  normalizedRecipient: string
  bolt11NetworkMismatch: boolean
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
  feePresetSelection: import('@/lib/esplora-fee-estimates').SendFeePresetLabel
  presetSatPerVbByLabel: Record<
    import('@/lib/esplora-fee-estimates').SendFeePresetLabel,
    number
  >
  feeEstimatesRefreshing: boolean
  customFeeRate: string
  useCustomFee: boolean
  onSelectFeePreset: (
    preset: import('@/lib/esplora-fee-estimates').SendFeePresetLabel,
    rateSatPerVb: number,
  ) => void
  onCustomFeeRateChange: (s: string) => void
  onUseCustomFeeChange: (b: boolean) => void
  isPending: boolean
  buildOrLabPreparing: boolean
  canBuild: boolean
  onSubmitBuild: () => void
  onApplyScannedPayload: (raw: string) => void
  /** Mainnet && persisted fiat denomination mode. */
  mainnetFiatMode: boolean
  defaultFiatCurrency: SupportedDefaultFiatCurrency
  btcPriceInFiat: number | null | undefined
  fiatRatesLoading: boolean
  /** Parsed sats from the amount field (fiat or BTC) for readonly BTC / validation display. */
  parsedAmountSats: number
  onFiatModeUserToggle?: (nextFiatMode: boolean) => void
}) {
  const [recipientScanOpen, setRecipientScanOpen] = useState(false)

  const hideEditableAmountForZeroMainnet =
    networkMode === 'mainnet' &&
    !isLabWithNoBalance &&
    ((!isLightningSendMode && confirmedBalance <= 0) ||
      (isLightningSendMode &&
        needsUserLightningAmount &&
        selectedLnBalanceQuery?.isSuccess === true &&
        (selectedLnBalanceSats ?? 0) <= 0))

  const showMainnetZeroBalanceWarning =
    hideEditableAmountForZeroMainnet &&
    (needsUserLightningAmount || !isLightningSendMode)

  const showBip11WithZeroBalance =
    hideEditableAmountForZeroMainnet &&
    isLightningSendMode &&
    !needsUserLightningAmount

  const useFiatAmountField =
    mainnetFiatMode &&
    !hideEditableAmountForZeroMainnet &&
    (needsUserLightningAmount || !isLightningSendMode)

  function spendableAmountRows(balanceSats: number) {
    if (mainnetFiatMode && btcPriceInFiat != null && btcPriceInFiat > 0) {
      return (
        <div className="space-y-1">
          <div>
            <FiatAmountDisplay
              amountSats={balanceSats}
              btcPriceInFiat={btcPriceInFiat}
              currency={defaultFiatCurrency}
              size="sm"
              className="inline text-muted-foreground"
            />
          </div>
          <div>
            <BitcoinAmountDisplay
              amountSats={balanceSats}
              size="sm"
              className="inline text-muted-foreground"
              allowUnitToggle={false}
            />
          </div>
        </div>
      )
    }
    return (
      <BitcoinAmountDisplay
        amountSats={balanceSats}
        size="sm"
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            {cardTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmitBuild()
            }}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="recipient-address">
                  {isLightningSendMode
                    ? 'Invoice or Lightning address'
                    : 'Recipient Address'}
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={isPending}
                  onClick={() => setRecipientScanOpen(true)}
                >
                  <ScanQrCode className="mr-2 h-4 w-4" aria-hidden />
                  Scan QR code
                </Button>
              </div>
              <Input
                id="recipient-address"
                value={recipient}
                onChange={(e) => onRecipientChange(e.target.value)}
                placeholder={
                  lightningAvailable
                    ? 'bc1q… or BOLT11 invoice or Lightning address'
                    : 'bc1q…'
                }
                disabled={isPending}
              />
              {recipient && !recipientFormatValid && (
                <p className="text-xs text-destructive">
                  {isLightningSendMode
                    ? 'Invalid Lightning invoice or Lightning address.'
                    : `Invalid address for ${networkMode}`}
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
              {isLightningSendMode && !lightningPayloadLengthOk(normalizedRecipient) && (
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
                {(needsUserLightningAmount || !isLightningSendMode) &&
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
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:text-amber-100"
                >
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0"
                    aria-hidden
                  />
                  <div>
                    <p className="font-medium">No spendable balance</p>
                    <p className="mt-1 text-muted-foreground">
                      You cannot send on this network until you have funds. Receive
                      Bitcoin first, then enter an amount here.
                    </p>
                  </div>
                </div>
              ) : isLightningSendMode && !needsUserLightningAmount ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  {mainnetFiatMode && btcPriceInFiat != null && btcPriceInFiat > 0 ? (
                    <>
                      <FiatAmountDisplay
                        amountSats={lightningPayAmountSats}
                        btcPriceInFiat={btcPriceInFiat}
                        currency={defaultFiatCurrency}
                        size="sm"
                      />
                      <div className="text-muted-foreground">
                        <BitcoinAmountDisplay
                          amountSats={lightningPayAmountSats}
                          size="sm"
                          allowUnitToggle={false}
                        />
                      </div>
                    </>
                  ) : (
                    <BitcoinAmountDisplay
                      amountSats={lightningPayAmountSats}
                      size="sm"
                    />
                  )}
                  {showBip11WithZeroBalance ? (
                    <div
                      role="alert"
                      className="mt-2 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-xs text-amber-900 dark:text-amber-100"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        Not enough balance to pay this invoice. Fund your wallet
                        first.
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <Input
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
                  {mainnetFiatMode &&
                    useFiatAmountField &&
                    btcPriceInFiat != null &&
                    btcPriceInFiat > 0 && (
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
                      {(btcPriceInFiat == null || !(btcPriceInFiat > 0)) ? (
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
                ) : (
                  <>
                    Available: {spendableAmountRows(confirmedBalance)}
                  </>
                )}
              </div>
              {isLabWithNoBalance && !isLightningSendMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No balance. Mine blocks or make a transaction to your wallet in
                  the lab.
                </p>
              )}
            </div>

            {!isLightningSendMode && (
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

            {buildOrLabPreparing ? (
              <LoadingSpinner
                text={
                  networkMode === 'lab'
                    ? 'Preparing transaction...'
                    : 'Building transaction...'
                }
              />
            ) : (
              <Button type="submit" className="w-full" disabled={!canBuild}>
                {submitLabel}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function lightningPayloadLengthOk(normalizedRecipient: string): boolean {
  return normalizedRecipient.length <= MAX_BOLT11_PAYMENT_REQUEST_LENGTH
}
