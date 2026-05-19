import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { FiatProviderCurrenciesData } from '@/lib/fiat-provider-currencies'
import {
  type FiatCurrencyCode,
  getFiatCurrencyUiMeta,
} from '@/lib/supported-fiat-currencies'

export type FiatProviderSupportedCurrenciesQueryState = Pick<
  UseQueryResult<FiatProviderCurrenciesData>,
  'isPending' | 'isError' | 'isSuccess' | 'data'
>

type FiatCurrencySettingsSelectProps = {
  selectClassName: string
  defaultFiatCurrency: FiatCurrencyCode
  onDefaultFiatCurrencyChange: (fiatCurrencyCode: FiatCurrencyCode) => void
  supportedCurrenciesQuery: FiatProviderSupportedCurrenciesQueryState
}

function renderFiatCurrencySelectOptions(
  defaultFiatCurrency: FiatCurrencyCode,
  supportedCurrenciesQuery: FiatProviderSupportedCurrenciesQueryState,
): ReactNode {
  if (supportedCurrenciesQuery.isPending) {
    return (
      <option value={defaultFiatCurrency}>
        Loading options… ({defaultFiatCurrency})
      </option>
    )
  }

  if (supportedCurrenciesQuery.isError) {
    return (
      <option value={defaultFiatCurrency}>
        {defaultFiatCurrency} (list unavailable)
      </option>
    )
  }

  const providerSupportedFiatCodes =
    supportedCurrenciesQuery.data?.codes ?? []
  if (providerSupportedFiatCodes.length === 0) {
    return (
      <option value={defaultFiatCurrency}>
        No currencies reported ({defaultFiatCurrency})
      </option>
    )
  }

  return providerSupportedFiatCodes.map((fiatCurrencyCodeOption) => {
    const { label: fiatCurrencyLabel } = getFiatCurrencyUiMeta(fiatCurrencyCodeOption)
    return (
      <option key={fiatCurrencyCodeOption} value={fiatCurrencyCodeOption}>
        {fiatCurrencyLabel} ({fiatCurrencyCodeOption})
      </option>
    )
  })
}

export function FiatCurrencySettingsSelect({
  selectClassName,
  defaultFiatCurrency,
  onDefaultFiatCurrencyChange,
  supportedCurrenciesQuery,
}: FiatCurrencySettingsSelectProps) {
  const providerSupportedFiatCodes =
    supportedCurrenciesQuery.data?.codes ?? []
  const isSelectDisabled =
    supportedCurrenciesQuery.isPending ||
    supportedCurrenciesQuery.isError ||
    (supportedCurrenciesQuery.isSuccess && providerSupportedFiatCodes.length === 0)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">Default fiat currency</span>
      <select
        className={selectClassName}
        value={defaultFiatCurrency}
        disabled={isSelectDisabled}
        aria-label="Default fiat currency"
        aria-busy={supportedCurrenciesQuery.isPending}
        onChange={(e) =>
          onDefaultFiatCurrencyChange(e.target.value as FiatCurrencyCode)
        }
      >
        {renderFiatCurrencySelectOptions(
          defaultFiatCurrency,
          supportedCurrenciesQuery,
        )}
      </select>
    </div>
  )
}

