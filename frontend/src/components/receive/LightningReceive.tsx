import { useState, useCallback, useMemo } from 'react'
import { Zap, Copy, Plus, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore } from '@/stores/lightningStore'
import { useReceiveStore, isInvoiceExpired } from '@/stores/receiveStore'
import type { LightningInvoice } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import { Link } from '@tanstack/react-router'
import { useCreateInvoiceMutation } from '@/hooks/useLightningMutations'
import {
  INVOICE_EXPIRY_OPTIONS,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  formatSatsCompact,
} from '@/lib/lightning-utils'

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Lightning Invoice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <p className="text-center text-sm text-muted-foreground">
            {formatSatsCompact(invoice.amountSats)} &middot; {expiryLabel} expiry
            {invoice.description && (
              <span className="block text-xs">{invoice.description}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-xs">
            {invoice.bolt11}
          </div>
          <Button size="icon" onClick={handleCopy} aria-label="Copy invoice">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
          <p className="text-sm font-medium">
            {formatSatsCompact(invoice.amountSats)}
          </p>
          {invoice.description && (
            <p className="truncate text-xs text-muted-foreground">
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
  const [amountSats, setAmountSats] = useState('')
  const [description, setDescription] = useState('')
  const [expirySeconds, setExpirySeconds] = useState(DEFAULT_INVOICE_EXPIRY_SECONDS)

  const createMutation = useCreateInvoiceMutation(() => {
    setAmountSats('')
    setDescription('')
    setExpirySeconds(DEFAULT_INVOICE_EXPIRY_SECONDS)
    onCreated()
  })

  const parsedAmount = parseInt(amountSats) || 0
  const canCreate = parsedAmount >= 1 && !createMutation.isPending

  const handleCreate = useCallback(() => {
    if (!canCreate) return
    createMutation.mutate({
      amountSats: parsedAmount,
      description: description.trim(),
      expirySeconds,
    })
  }, [canCreate, parsedAmount, description, expirySeconds, createMutation])

  return (
    <InfomodeWrapper
      infoId="receive-lightning-invoice-form"
      infoTitle="Lightning invoice"
      infoText="A Lightning invoice (also called a BOLT11 invoice) is a one-time payment request. You specify how many satoshis you want to receive, an optional description, and how long the invoice stays valid. The payer scans the QR code or pastes the invoice string into their Lightning wallet to pay you."
      className="rounded-xl"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Create Invoice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleCreate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invoice-amount">Amount (sats)</Label>
              <Input
                id="invoice-amount"
                type="number"
                value={amountSats}
                onChange={(e) => setAmountSats(e.target.value)}
                placeholder="0"
                min="1"
                step="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-description">Description (optional)</Label>
              <Input
                id="invoice-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this payment for?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-expiry">Expiry</Label>
              <div className="flex gap-2">
                {INVOICE_EXPIRY_OPTIONS.map((option) => (
                  <Button
                    key={option.seconds}
                    type="button"
                    variant={expirySeconds === option.seconds ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setExpirySeconds(option.seconds)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!canCreate}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Invoice...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Create Invoice
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}

function NoConnectionPrompt() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="space-y-3 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No Lightning wallet connected. Connect one to create real invoices.
          </p>
          <Button asChild variant="outline">
            <Link to="/wallet/management">
              Connect Lightning Wallet
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function LightningReceive() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const activeConnection = useLightningStore((s) =>
    activeWalletId != null ? s.getActiveConnection(activeWalletId) : null,
  )
  const activeInvoice = useReceiveStore((s) => s.activeInvoice)
  const sessionInvoices = useReceiveStore((s) => s.sessionInvoices)
  const setActiveInvoice = useReceiveStore((s) => s.setActiveInvoice)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const hasConnection = activeConnection != null

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
        {!hasConnection && <NoConnectionPrompt />}
        <InvoiceCreateForm onCreated={() => setShowCreateForm(false)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!hasConnection && <NoConnectionPrompt />}
      {showForm ? (
        <InvoiceCreateForm onCreated={() => setShowCreateForm(false)} />
      ) : (
        <>
          {activeInvoice && <InvoiceQrDisplay invoice={activeInvoice} />}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create New Invoice
          </Button>
        </>
      )}

      {pastInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Previous Invoices</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
