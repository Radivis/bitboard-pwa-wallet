import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">Network</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Network selection will be available here.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">Appearance</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Use the theme toggle in the header to switch between light and dark
          mode.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">About</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Bitboard Wallet &mdash; A Progressive Web App Bitcoin wallet.
        </p>
      </div>
    </div>
  )
}
