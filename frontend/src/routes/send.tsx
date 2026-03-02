import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/send')({
  component: SendPage,
})

function SendPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Send Bitcoin</h2>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">
          The send form will appear here once a wallet is configured.
        </p>
      </div>
    </div>
  )
}
