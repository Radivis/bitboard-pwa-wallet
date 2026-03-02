import { createFileRoute } from '@tanstack/react-router'
import { QrCode, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/receive')({
  component: ReceivePage,
})

function QrCodePlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          QR Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
            <QrCode className="h-12 w-12 text-muted-foreground" />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            QR code will appear here once a wallet is configured.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function AddressDisplay() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving Address</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-sm text-muted-foreground">
            No address generated
          </div>
          <Button variant="outline" size="icon" disabled aria-label="Copy address">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Generate a new address after setting up your wallet.
        </p>
      </CardContent>
    </Card>
  )
}

function ReceivePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Receive Bitcoin</h2>
      <QrCodePlaceholder />
      <AddressDisplay />
    </div>
  )
}
