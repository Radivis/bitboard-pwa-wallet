import { useState, useCallback, useMemo } from 'react'
import { Zap, Copy, Plus, Loader2, Coins, MessageSquareText } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore } from '@/stores/lightningStore'
import { useReceiveStore, isInvoiceExpired } from '@/stores/receiveStore'
import type { LightningInvoice } from '@/stores/lightningStore'
import { NETWORK_LABELS, useWalletStore } from '@/stores/walletStore'
import { Link } from '@tanstack/react-router'
import { useCreateInvoiceMutation } from '@/hooks/useLightningMutations'
import {
  INVOICE_EXPIRY_OPTIONS,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
} from '@/lib/lightning/lightning-utils'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH } from '@/lib/lightning/lightning-input-limits'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import {
  amountSatsFromFiatAndBtcPrice,
  parsePositiveFiatAmountInput,
} from '@/lib/fiat/fiat-amount-to-sats'
import { fiatAmountInputPlaceholder } from '@/lib/fiat/format-fiat-display'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import type { BitcoinAmountDisplaySize } from '@/components/BitcoinAmountDisplay'
import {
  parseInvoiceAmountField,
  type InvoiceAmountFieldParse,
} from '@/lib/lightning/parse-invoice-amount-field'

/** Shown when a BOLT11 invoice has no fixed amount (NWC amountless flow). */
const LIGHTNING_INVOICE_AMOUNT_SET_BY_PAYER_LABEL = 'Amount set by payer'

function LightningInvoiceAmountBlock({
  amountSats,
  size,
  className,
}: {
  amountSats: number
  size: BitcoinAmountDisplaySize
  className?: string
}) {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const fiatRatesQuery = useMainnetFiatRatesQuery({
    allowFetchWhenPortfolioZeroForReceivePage: true,
  })
  const btcPriceInFiat = fiatRatesQuery.data?.btcPriceInFiat
  const showFiatLayout = networkMode === 'mainnet' && fiatDenominationMode && isUsableBtcSpotPriceInFiat(btcPriceInFiat)

  return (
    <FiatBtcAmountDisplay
      amountSats={amountSats}
      showFiatLayout={showFiatLayout}
      btcPriceInFiat={btcPriceInFiat}
      currency={defaultFiatCurrency}
      size={size}
      isDetail={size !== 'lg'}
      rateLoading={fiatRatesQuery.isPending}
      className={className}
    />
  )
}

function MainnetReceiveDenominationSwitch() {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  if (networkMode !== 'mainnet') return null
  return <BitcoinFiatDenominationSwitch />
}

function InvoiceQrDisplay({ invoice }: { invoice: LightningInvoice }) {
  const expiryLabel =
    INVOICE_EXPIRY_OPTIONS.find((o) => o.seconds === invoice.expirySeconds)?.label ?? 'Custom'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(invoice.bolt11)
      toast.success('Invoice copied to clipboard')
    } catch {
      toast.error('Failed to copy invoice')
    }
  }, [invoice.bolt11])

  return (
    <DesignCard>
      <DesignCardHeader>
        <DesignCardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lightning Invoice
        </DesignCardTitle>
      </DesignCardHeader>
      <DesignCardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-lg bg-white p-4">
            <QRCodeSVG
              value={invoice.bolt11}
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
          <p className="design-type-regular text-center text-muted-foreground">
            {invoice.amountSats == null ? (
              <span className="text-muted-foreground">
                {LIGHTNING_INVOICE_AMOUNT_SET_BY_PAYER_LABEL}
              </span>
            ) : (
              <LightningInvoiceAmountBlock
                amountSats={invoice.amountSats}
                size="sm"
                className="inline text-muted-foreground"
              />
            )}{' '}
            &middot; {expiryLabel} expiry
            {invoice.description && (
              <span className="design-type-regular block">{invoice.description}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="design-type-addresses flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2">
            {invoice.bolt11}
          </div>
          <DesignButton onClick={handleCopy} aria-label="Copy invoice" icon={<Copy />} />
        </div>
      </DesignCardContent>
    </DesignCard>
  )
}

function InvoiceListItem({
  invoice,
  isActive,
  onSelect,
}: {
  invoice: LightningInvoice
  isActive: boolean
  onSelect: () => void
}) {
  const expired = isInvoiceExpired(invoice)

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={expired}
      className={`w-full rounded-md border p-3 text-left transition-colors ${
        expired
          ? 'cursor-not-allowed opacity-50'
          : isActive
            ? 'border-primary bg-primary/5'
            : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="design-type-emphasis">
            {invoice.amountSats == null ? (
              LIGHTNING_INVOICE_AMOUNT_SET_BY_PAYER_LABEL
            ) : (
              <LightningInvoiceAmountBlock amountSats={invoice.amountSats} size="sm" />
            )}
          </p>
          {invoice.description && (
            <p className="design-type-regular truncate text-muted-foreground">
              {invoice.description}
            </p>
          )}
        </div>
        <div className="ml-2 flex items-center gap-2">
          {expired ? (
            <Badge variant="outline">expired</Badge>
          ) : (
            <Badge variant="secondary">pending</Badge>
          )}
        </div>
      </div>
    </button>
  )
}

function InvoiceCreateForm({ onCreated }: { onCreated: () => void }) {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const [amountRaw, setAmountRaw] = useState('')
  const [description, setDescription] = useState('')
  const [expirySeconds, setExpirySeconds] = useState(DEFAULT_INVOICE_EXPIRY_SECONDS)

  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const fiatRatesQuery = useMainnetFiatRatesQuery({
    allowFetchWhenPortfolioZeroForReceivePage: true,
  })
  const btcPriceInFiat = fiatRatesQuery.data?.btcPriceInFiat
  const hasUsableFiatSpot = isUsableBtcSpotPriceInFiat(btcPriceInFiat)

  const mainnetFiatEntry =
    networkMode === 'mainnet' && fiatDenominationMode

  const createMutation = useCreateInvoiceMutation(() => {
    setAmountRaw('')
    setDescription('')
    setExpirySeconds(DEFAULT_INVOICE_EXPIRY_SECONDS)
    onCreated()
  })

  const amountParse = useMemo((): InvoiceAmountFieldParse => {
    if (mainnetFiatEntry) {
      const trimmedAmount = amountRaw.trim()
      if (trimmedAmount === '') return { kind: 'amountless' }
      const fiat = parsePositiveFiatAmountInput(trimmedAmount)
      if (fiat == null) return { kind: 'invalid' }
      if (fiat === 0) return { kind: 'amountless' }
      if (!isUsableBtcSpotPriceInFiat(btcPriceInFiat)) return { kind: 'invalid' }
      const sats = amountSatsFromFiatAndBtcPrice(fiat, btcPriceInFiat)
      if (sats == null || sats < 1) return { kind: 'invalid' }
      return { kind: 'fixed', sats }
    }
    return parseInvoiceAmountField(amountRaw)
  }, [mainnetFiatEntry, amountRaw, btcPriceInFiat])

  const parsedSatsForPreview =
    amountParse.kind === 'fixed' ? amountParse.sats : null

  const canCreate = amountParse.kind !== 'invalid' && !createMutation.isPending

  const handleCreate = useCallback(() => {
    if (amountParse.kind === 'invalid' || createMutation.isPending) return
    const trimmedDescription = description.trim()
    if (amountParse.kind === 'amountless') {
      createMutation.mutate({
        description: trimmedDescription,
        expirySeconds,
      })
    } else {
      createMutation.mutate({
        amountSats: amountParse.sats,
        description: trimmedDescription,
        expirySeconds,
      })
    }
  }, [amountParse, createMutation, description, expirySeconds])

  return (
    <InfomodeWrapper
      infoId="receive-lightning-invoice-form"
      infoTitle="Lightning invoice"
      infoText="A Lightning invoice (also called a BOLT11 invoice) is a one-time payment request. You may enter how many satoshis you want to receive or leave the amount empty for an amountless invoice (the payer must choose the amount when paying). You can add an optional description and choose how long the invoice stays valid. The payer scans the QR code or pastes the invoice string into their Lightning wallet to pay you."
      className="rounded-xl"
    >
      <DesignCard>
        <DesignCardHeader>
          <DesignCardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Create Invoice
          </DesignCardTitle>
        </DesignCardHeader>
        <DesignCardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleCreate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invoice-amount">
                {mainnetFiatEntry
                  ? `Amount (${defaultFiatCurrency}) (optional)`
                  : 'Amount (sats) (optional)'}
              </Label>
              <DesignInput
                id="invoice-amount"
                type="text"
                leadingIcon={Coins}
                inputMode={mainnetFiatEntry ? 'decimal' : 'numeric'}
                pattern={mainnetFiatEntry ? undefined : '[0-9]*'}
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                placeholder={
                  mainnetFiatEntry
                    ? fiatAmountInputPlaceholder(defaultFiatCurrency)
                    : 'Leave empty for amountless'
                }
                autoComplete="off"
              />
              {mainnetFiatEntry &&
                parsedSatsForPreview != null &&
                hasUsableFiatSpot && (
                  <p className="design-type-regular text-muted-foreground">
                    ≈{' '}
                    <BitcoinAmountDisplay
                      amountSats={parsedSatsForPreview}
                      size="sm"
                      className="inline"
                      allowUnitToggle={false}
                    />
                  </p>
                )}
              {mainnetFiatEntry &&
                amountRaw.trim() !== '' &&
                parsePositiveFiatAmountInput(amountRaw) != null &&
                parsePositiveFiatAmountInput(amountRaw)! > 0 &&
                !hasUsableFiatSpot &&
                !fiatRatesQuery.isPending && (
                  <p className="design-type-regular text-destructive">
                    Exchange rate unavailable. Check your connection or rate service
                    in Settings.
                  </p>
                )}
              {amountParse.kind === 'amountless' ? (
                <p className="design-type-regular text-muted-foreground">
                  If you don&apos;t define an amount, the amount for this invoice must
                  be specified by payer.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-description">Description (optional)</Label>
              <DesignInput
                id="invoice-description"
                leadingIcon={MessageSquareText}
                value={description}
                maxLength={MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this payment for?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-expiry">Expiry</Label>
              <div className="flex gap-2">
                {INVOICE_EXPIRY_OPTIONS.map((option) => (
                  <DesignButton
                    key={option.seconds}
                    type="button"
                    appearance={expirySeconds === option.seconds ? 'primary' : 'secondary'}
                    className="flex-1"
                    onClick={() => setExpirySeconds(option.seconds)}
                  >
                    {option.label}
                  </DesignButton>
                ))}
              </div>
            </div>

            <DesignButton
              type="submit"
              className="w-full"
              disabled={!canCreate}
              icon={
                createMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Zap />
                )
              }
            >
              {createMutation.isPending ? 'Creating Invoice...' : 'Create Invoice'}
            </DesignButton>
          </form>
        </DesignCardContent>
      </DesignCard>
    </InfomodeWrapper>
  )
}

function NoConnectionPrompt({
  networkLabel,
  hasOtherNetworkConnections,
}: {
  networkLabel: string
  hasOtherNetworkConnections: boolean
}) {
  return (
    <DesignCard>
      <DesignCardContent className="py-6">
        <div className="space-y-3 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="design-type-regular text-muted-foreground">
            {hasOtherNetworkConnections
              ? `No Lightning wallet for ${networkLabel}. Connect or label one for this network in Management to create real invoices.`
              : 'No Lightning wallet connected. Connect one to create real invoices.'}
          </p>
          <DesignButton appearance="secondary" asChild>
            <Link to="/wallet/management">Connect Lightning Wallet</Link>
          </DesignButton>
        </div>
      </DesignCardContent>
    </DesignCard>
  )
}

export function LightningReceive() {
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const matchingConnection = useLightningStore((lightningState) =>
    activeWalletId != null
      ? lightningState.getActiveConnection(activeWalletId, networkMode)
      : null,
  )
  const hasAnyLightningConnection = useLightningStore((lightningState) =>
    activeWalletId != null
      ? lightningState.getConnectionsForWallet(activeWalletId).length > 0
      : false,
  )
  const activeInvoice = useReceiveStore((receiveState) => receiveState.activeInvoice)
  const sessionInvoices = useReceiveStore((receiveState) => receiveState.sessionInvoices)
  const setActiveInvoice = useReceiveStore((receiveState) => receiveState.setActiveInvoice)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const hasMatchingConnection = matchingConnection != null
  const networkLabel = NETWORK_LABELS[networkMode]

  const visibleInvoices = useMemo(
    () => sessionInvoices.filter((inv) => !isInvoiceExpired(inv)),
    [sessionInvoices],
  )

  const pastInvoices = useMemo(
    () => visibleInvoices.filter((inv) => inv.bolt11 !== activeInvoice?.bolt11),
    [visibleInvoices, activeInvoice],
  )

  const showForm = showCreateForm || activeInvoice == null

  if (showForm && activeInvoice == null && sessionInvoices.length === 0) {
    return (
      <div className="space-y-4">
        <MainnetReceiveDenominationSwitch />
        {!hasMatchingConnection && (
          <NoConnectionPrompt
            networkLabel={networkLabel}
            hasOtherNetworkConnections={
              hasAnyLightningConnection && !hasMatchingConnection
            }
          />
        )}
        <InvoiceCreateForm onCreated={() => setShowCreateForm(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MainnetReceiveDenominationSwitch />
      {!hasMatchingConnection && (
        <NoConnectionPrompt
          networkLabel={networkLabel}
          hasOtherNetworkConnections={
            hasAnyLightningConnection && !hasMatchingConnection
          }
        />
      )}
      {showForm ? (
        <InvoiceCreateForm onCreated={() => setShowCreateForm(false)} />
      ) : (
        <>
          {activeInvoice && <InvoiceQrDisplay invoice={activeInvoice} />}
          <DesignButton
            appearance="secondary"
            className="w-full"
            onClick={() => setShowCreateForm(true)}
            icon={<Plus />}
          >
            Create New Invoice
          </DesignButton>
        </>
      )}

      {pastInvoices.length > 0 && (
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Previous Invoices</DesignCardTitle>
          </DesignCardHeader>
          <DesignCardContent>
            <div className="space-y-2">
              {pastInvoices.map((invoice) => (
                <InvoiceListItem
                  key={invoice.bolt11}
                  invoice={invoice}
                  isActive={activeInvoice?.bolt11 === invoice.bolt11}
                  onSelect={() => {
                    setActiveInvoice(invoice)
                    setShowCreateForm(false)
                  }}
                />
              ))}
            </div>
          </DesignCardContent>
        </DesignCard>
      )}
    </div>
  )
}
