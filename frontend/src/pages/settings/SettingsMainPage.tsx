import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
import { BitcoinUnitSelect } from '@/components/BitcoinUnitSelect'
import { useWallets } from '@/db'
import { useFeatureStore } from '@/stores/featureStore'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import {
  SUPPORTED_DEFAULT_FIAT_CURRENCIES,
  type SupportedDefaultFiatCurrency,
  FIAT_CURRENCY_UI,
} from '@/lib/supported-fiat-currencies'
import {
  FIAT_RATE_PROVIDER_IDS,
  FIAT_RATE_PROVIDER_LABELS,
  type FiatRateProviderId,
} from '@/lib/fiat-rate-service-whitelist'

export function SettingsMainPage() {
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  const { data: wallets } = useWallets()
  const hasWallets = (wallets?.length ?? 0) > 0
  const defaultBitcoinUnit = useBitcoinDisplayUnitStore((s) => s.defaultBitcoinUnit)
  const setDefaultBitcoinUnit = useBitcoinDisplayUnitStore(
    (s) => s.setDefaultBitcoinUnit,
  )
  const defaultFiatCurrency = useFiatDenominationStore((s) => s.defaultFiatCurrency)
  const setDefaultFiatCurrency = useFiatDenominationStore(
    (s) => s.setDefaultFiatCurrency,
  )
  const fiatRateProvider = useFiatDenominationStore((s) => s.fiatRateProvider)
  const setFiatRateProvider = useFiatDenominationStore((s) => s.setFiatRateProvider)

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

      <Card>
        <CardHeader>
          <CardTitle>Currency / unit defaults</CardTitle>
          <CardDescription>
            Default Bitcoin display unit, fiat currency for mainnet conversion, and which
            public ticker feeds indicative amounts. On mainnet you can still switch between
            Bitcoin and fiat display on Dashboard, Send, and Receive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">Default Bitcoin unit</span>
            <BitcoinUnitSelect
              value={defaultBitcoinUnit}
              onChange={setDefaultBitcoinUnit}
              aria-label="Default Bitcoin amount unit"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">Default fiat currency</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={defaultFiatCurrency}
              aria-label="Default fiat currency"
              onChange={(e) =>
                setDefaultFiatCurrency(e.target.value as SupportedDefaultFiatCurrency)
              }
            >
              {SUPPORTED_DEFAULT_FIAT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {FIAT_CURRENCY_UI[c].label} ({c})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">Currency rate service</span>
            <select
              className="rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={fiatRateProvider}
              aria-label="Currency rate data provider"
              onChange={(e) =>
                setFiatRateProvider(e.target.value as FiatRateProviderId)
              }
            >
              {FIAT_RATE_PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {FIAT_RATE_PROVIDER_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <EsploraUrlSettings />
    </div>
  )
}
