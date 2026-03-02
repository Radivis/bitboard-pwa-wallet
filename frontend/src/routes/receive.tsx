import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/receive')({
  component: ReceivePage,
})

function ReceivePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Receive Bitcoin</h2>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">
          Your receiving address and QR code will appear here once a wallet is
          configured.
        </p>
      </div>
    </div>
  )
}
