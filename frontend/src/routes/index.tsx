import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">Balance</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">0.00000000 BTC</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">Recent Transactions</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No transactions yet.
        </p>
      </div>
    </div>
  )
}
