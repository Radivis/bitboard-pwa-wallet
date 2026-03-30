import { useState, useCallback } from 'react'
import { Zap, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import {
  INVOICE_EXPIRY_OPTIONS,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  formatSatsCompact,
} from '@/lib/lightning-utils'

export function LightningReceive() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const createInvoice = useLightningStore((s) => s.createInvoice)

  const [amountSats, setAmountSats] = useState('')
  const [description, setDescription] = useState('')
  const [expirySeconds, setExpirySeconds] = useState(DEFAULT_INVOICE_EXPIRY_SECONDS)
  const [createdInvoiceBolt11, setCreatedInvoiceBolt11] = useState<string | null>(null)

  const parsedAmount = parseInt(amountSats) || 0
  const canCreate = parsedAmount >= 1

  const handleCreateInvoice = useCallback(() => {
    if (!canCreate) return
    const invoice = createInvoice({
      amountSats: parsedAmount,
      description: description.trim(),
      expirySeconds,
      networkMode,
    })
    setCreatedInvoiceBolt11(invoice.bolt11)
    toast.success(`Invoice created for ${formatSatsCompact(parsedAmount)}`)
  }, [canCreate, parsedAmount, description, expirySeconds, networkMode, createInvoice])

  const handleCopyInvoice = useCallback(async () => {
    if (!createdInvoiceBolt11) return
    try {
      await navigator.clipboard.writeText(createdInvoiceBolt11)
      toast.success('Invoice copied to clipboard')
    } catch {
      toast.error('Failed to copy invoice')
    }
  }, [createdInvoiceBolt11])

  const handleReset = useCallback(() => {
    setCreatedInvoiceBolt11(null)
    setAmountSats('')
    setDescription('')
    setExpirySeconds(DEFAULT_INVOICE_EXPIRY_SECONDS)
  }, [])

  if (createdInvoiceBolt11) {
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
                value={createdInvoiceBolt11}
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
              {formatSatsCompact(parsedAmount)} &middot;{' '}
              {INVOICE_EXPIRY_OPTIONS.find((o) => o.seconds === expirySeconds)?.label ?? 'Custom'} expiry
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-xs">
              {createdInvoiceBolt11}
            </div>
            <Button
              size="icon"
              onClick={handleCopyInvoice}
              aria-label="Copy invoice"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" className="w-full" onClick={handleReset}>
            Create New Invoice
          </Button>
        </CardContent>
      </Card>
    )
  }

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
              handleCreateInvoice()
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
              <Zap className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </form>
        </CardContent>
      </Card>
    </InfomodeWrapper>
  )
}
