import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ScanQrCode } from 'lucide-react'
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
  feeRate,
  customFeeRate,
  useCustomFee,
  onFeeRateChange,
  onCustomFeeRateChange,
  onUseCustomFeeChange,
  isPending,
  buildOrLabPreparing,
  canBuild,
  onSubmitBuild,
  onApplyScannedPayload,
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
  feeRate: number
  customFeeRate: string
  useCustomFee: boolean
  onFeeRateChange: (n: number) => void
  onCustomFeeRateChange: (s: string) => void
  onUseCustomFeeChange: (b: boolean) => void
  isPending: boolean
  buildOrLabPreparing: boolean
  canBuild: boolean
  onSubmitBuild: () => void
  onApplyScannedPayload: (raw: string) => void
}) {
  const [recipientScanOpen, setRecipientScanOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle} icon={ArrowUpRight} />

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
                {(needsUserLightningAmount || !isLightningSendMode) && (
                  <BitcoinUnitSelect
                    value={amountUnit}
                    onChange={onAmountUnitChange}
                    disabled={isPending}
                    aria-label="Unit for amount entry"
                  />
                )}
              </div>
              {isLightningSendMode && !needsUserLightningAmount ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  <BitcoinAmountDisplay
                    amountSats={lightningPayAmountSats}
                    size="sm"
                  />
                </p>
              ) : (
                <Input
                  id="send-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) =>
                    onAmountChange(e.target.value, { fromUser: true })
                  }
                  placeholder={amountInputPlaceholderForUnit(amountUnit)}
                  disabled={isPending}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {isLightningSendMode ? (
                  <>
                    Lightning wallet:{' '}
                    {selectedLnBalanceQuery?.isPending ? (
                      'Loading balance…'
                    ) : selectedLnBalanceQuery?.isSuccess ? (
                      <BitcoinAmountDisplay
                        amountSats={selectedLnBalanceSats ?? 0}
                        size="sm"
                        className="inline text-muted-foreground"
                      />
                    ) : (
                      '—'
                    )}
                  </>
                ) : (
                  <>
                    Available:{' '}
                    <BitcoinAmountDisplay
                      amountSats={confirmedBalance}
                      size="sm"
                      className="inline text-muted-foreground"
                    />
                  </>
                )}
              </p>
              {isLabWithNoBalance && !isLightningSendMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No balance. Mine blocks or make a transaction to your wallet in
                  the lab.
                </p>
              )}
            </div>

            {!isLightningSendMode && (
              <SendOnChainFeeSection
                feeRate={feeRate}
                customFeeRate={customFeeRate}
                useCustomFee={useCustomFee}
                isPending={isPending}
                setFeeRate={onFeeRateChange}
                setCustomFeeRate={onCustomFeeRateChange}
                setUseCustomFee={onUseCustomFeeChange}
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
