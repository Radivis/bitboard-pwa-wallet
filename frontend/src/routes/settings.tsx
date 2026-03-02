import { createFileRoute } from '@tanstack/react-router'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { useWalletStore, NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const NETWORK_OPTIONS: NetworkMode[] = ['mainnet', 'testnet', 'signet', 'regtest']

function NetworkSelector() {
  const networkMode = useWalletStore((state) => state.networkMode)
  const setNetworkMode = useWalletStore((state) => state.setNetworkMode)

  return (
    <div className="flex flex-wrap gap-2">
      {NETWORK_OPTIONS.map((network) => (
        <Button
          key={network}
          variant={networkMode === network ? 'default' : 'outline'}
          size="sm"
          onClick={() => setNetworkMode(network)}
        >
          {NETWORK_LABELS[network]}
        </Button>
      ))}
    </div>
  )
}

function ThemeSelector() {
  const themeMode = useThemeStore((state) => state.themeMode)
  const setThemeMode = useThemeStore((state) => state.setThemeMode)

  return (
    <div className="flex flex-wrap gap-2">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          variant={themeMode === value ? 'default' : 'outline'}
          size="sm"
          onClick={() => setThemeMode(value)}
          className="gap-2"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </div>
  )
}

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">Network</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Select the Bitcoin network to connect to.
        </p>
        <div className="mt-4">
          <NetworkSelector />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h3 className="text-lg font-medium">Appearance</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose your preferred color scheme.
        </p>
        <div className="mt-4">
          <ThemeSelector />
        </div>
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
