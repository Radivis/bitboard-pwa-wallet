import { createFileRoute } from '@tanstack/react-router'
import { useWalletStore } from '@/stores/walletStore'
import { AppDescription } from '@/components/AppDescription'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ThemeSelector } from '@/components/settings/ThemeSelector'
import { NetworkSelector } from '@/components/settings/NetworkSelector'
import { AddressTypeSelector } from '@/components/settings/AddressTypeSelector'
import { EsploraUrlSettings } from '@/components/settings/EsploraUrlSettings'
import { SeedPhraseBackup } from '@/components/settings/SeedPhraseBackup'
import { WalletManagement } from '@/components/settings/WalletManagement'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

export function SettingsPage() {
  const activeWalletId = useWalletStore((s) => s.activeWalletId)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      {activeWalletId && <WalletManagement />}

      <Card>
        <CardHeader>
          <CardTitle>Network</CardTitle>
          <CardDescription>
            Select the Bitcoin network to connect to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NetworkSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address Type</CardTitle>
          <CardDescription>
            Choose the address format for new wallets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddressTypeSelector />
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

      <EsploraUrlSettings />

      {activeWalletId && <SeedPhraseBackup />}

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bitboard Wallet &mdash; A Progressive Web App Bitcoin wallet.</p>
          <AppDescription />
          <p>Version 0.1.0</p>
        </CardContent>
      </Card>
    </div>
  )
}
