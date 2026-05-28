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
import { useFiatProviderSupportedCurrenciesQuery } from '@/hooks/useFiatProviderSupportedCurrenciesQuery'
import { FiatCurrencySettingsSelect } from '@/components/settings/FiatCurrencySettingsSelect'
import {
  FIAT_RATE_PROVIDER_IDS,
  FIAT_RATE_PROVIDER_LABELS,
  type FiatRateProviderId,
} from '@/lib/fiat/fiat-rate-service-whitelist'

export function SettingsMainPage() {
  const segwitAddressesEnabled = useFeatureStore((featureState) => featureState.segwitAddressesEnabled)
  const { data: wallets } = useWallets()
  const hasWallets = (wallets?.length ?? 0) > 0
  const defaultBitcoinUnit = useBitcoinDisplayUnitStore((bitcoinDisplayUnitState) => bitcoinDisplayUnitState.defaultBitcoinUnit)
  const setDefaultBitcoinUnit = useBitcoinDisplayUnitStore(
    (bitcoinDisplayUnitState) => bitcoinDisplayUnitState.setDefaultBitcoinUnit,
  )
  const defaultFiatCurrency = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.defaultFiatCurrency)
  const setDefaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.setDefaultFiatCurrency,
  )
  const fiatRateProvider = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.fiatRateProvider)
  const setFiatRateProvider = useFiatDenominationStore((fiatDenominationState) => fiatDenominationState.setFiatRateProvider)

  const fiatProviderSupportedCurrenciesQuery = useFiatProviderSupportedCurrenciesQuery(
    fiatRateProvider,
  )
  const fiatSettingsSelectClassName =
    'rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
            <span className="text-sm text-muted-foreground">Currency rate service</span>
            <select
              className={fiatSettingsSelectClassName}
              value={fiatRateProvider}
              aria-label="Currency rate data provider"
              onChange={(e) =>
                setFiatRateProvider(e.target.value as FiatRateProviderId)
              }
            >
              {FIAT_RATE_PROVIDER_IDS.map((fiatRateProviderOptionId) => (
                <option key={fiatRateProviderOptionId} value={fiatRateProviderOptionId}>
                  {FIAT_RATE_PROVIDER_LABELS[fiatRateProviderOptionId]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <FiatCurrencySettingsSelect
              selectClassName={fiatSettingsSelectClassName}
              defaultFiatCurrency={defaultFiatCurrency}
              onDefaultFiatCurrencyChange={setDefaultFiatCurrency}
              supportedCurrenciesQuery={fiatProviderSupportedCurrenciesQuery}
            />
            <p className="text-xs text-muted-foreground sm:text-right">
              Available options depend on the selected rate service.
            </p>
            {fiatProviderSupportedCurrenciesQuery.isError ? (
              <p className="text-xs text-destructive sm:text-right" role="alert">
                Could not load the currency list for this service. Try again or pick
                another rate service.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <EsploraUrlSettings />
    </div>
  )
}
