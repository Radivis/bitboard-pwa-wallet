import { createFileRoute } from '@tanstack/react-router'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { useWalletStore, NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

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

      <Card>
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>Select the Bitcoin network to connect to.</CardDescription>
        </CardHeader>
        <CardContent>
          <NetworkSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred color scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bitboard Wallet &mdash; A Progressive Web App Bitcoin wallet.</p>
          <p>Version 0.1.0</p>
        </CardContent>
      </Card>
    </div>
  )
}
