import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { AppDescription } from '@/components/AppDescription'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { ThemeSelector } from '@/components/settings/ThemeSelector'
import { NetworkSelector } from '@/components/settings/NetworkSelector'
import { NetworkCardCommittedDescriptor } from '@/components/settings/NetworkCardCommittedDescriptor'
import { AddressTypeSelector } from '@/components/settings/AddressTypeSelector'
import { EsploraUrlSettings } from '@/components/settings/EsploraUrlSettings'
import { FeatureToggles } from '@/components/settings/FeatureToggles'
import { SettingsSecurityCard } from '@/components/settings/SettingsSecurityCard'
import { ChangeAppPasswordModal } from '@/components/ChangeAppPasswordModal'
import { UpgradeFromNearZeroPasswordModal } from '@/components/UpgradeFromNearZeroPasswordModal'
import { useWallets } from '@/db'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import { useFeatureStore } from '@/stores/featureStore'

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})

export function SettingsPage() {
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  const { data: wallets } = useWallets()
  const hasWallets = (wallets?.length ?? 0) > 0
  const nearZeroActive = useNearZeroSecurityStore((s) => s.active)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [upgradeFromNearZeroOpen, setUpgradeFromNearZeroOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" icon={Settings} />

      <InfomodeWrapper
        infoId="settings-network-card"
        infoTitle="Bitcoin networks"
        infoText="Bitcoin exists on more than one network. Mainnet is the real-money chain; the others are mainly for practice, learning, and software testing, using coins that are not worth real dollars. Choose the network that matches what you are doing so balances and transactions line up with the right environment."
        className="rounded-xl"
      >
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
          {hasWallets ? (
            <CardFooter className="flex-col items-stretch border-t pt-6">
              <NetworkCardCommittedDescriptor />
            </CardFooter>
          ) : null}
        </Card>
      </InfomodeWrapper>

      {segwitAddressesEnabled ? (
        <InfomodeWrapper
          infoId="settings-address-type-card"
          infoTitle="Address type"
          infoText="This setting controls how Bitboard derives new receiving addresses from your seed—Taproot (BIP86) versus SegWit (BIP84). Both are standard and secure; they produce different address shapes. Changing it does not delete money you already received on the other style, but day-to-day you usually stick to one type for simplicity."
          className="rounded-xl"
        >
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
        </InfomodeWrapper>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred color scheme.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <InfomodeWrapper
        infoId="settings-features-card"
        infoTitle="Features"
        infoText="Enable or disable optional wallet features. These are advanced capabilities that go beyond basic Bitcoin on-chain operations. Mainnet access must be turned on here before you can select Mainnet under Network. Each feature can be turned on independently when you are ready to explore it."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>
              Enable optional wallet capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureToggles />
          </CardContent>
        </Card>
      </InfomodeWrapper>

      <EsploraUrlSettings />

      <SettingsSecurityCard
        hasWallets={hasWallets}
        nearZeroActive={nearZeroActive}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
        onOpenUpgradeFromNearZero={() => setUpgradeFromNearZeroOpen(true)}
      />

      <ChangeAppPasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />

      <UpgradeFromNearZeroPasswordModal
        open={upgradeFromNearZeroOpen}
        onOpenChange={setUpgradeFromNearZeroOpen}
      />

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
