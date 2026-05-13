import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  isSupportedDefaultFiatCurrency,
  type SupportedDefaultFiatCurrency,
} from '@/lib/supported-fiat-currencies'
import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { isKnownFiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'

const STORAGE_KEY = 'fiat-denomination-storage'

const DEFAULT_FIAT: SupportedDefaultFiatCurrency = 'USD'
const DEFAULT_PROVIDER: FiatRateProviderId = 'kraken'

interface FiatDenominationState {
  fiatDenominationMode: boolean
  defaultFiatCurrency: SupportedDefaultFiatCurrency
  fiatRateProvider: FiatRateProviderId
  setFiatDenominationMode: (v: boolean) => void
  setDefaultFiatCurrency: (c: SupportedDefaultFiatCurrency) => void
  setFiatRateProvider: (p: FiatRateProviderId) => void
}

function coerceDefaultFiatCurrency(
  v: unknown,
): SupportedDefaultFiatCurrency {
  return typeof v === 'string' && isSupportedDefaultFiatCurrency(v)
    ? v
    : DEFAULT_FIAT
}

function coerceFiatRateProvider(v: unknown): FiatRateProviderId {
  return typeof v === 'string' && isKnownFiatRateProviderId(v)
    ? v
    : DEFAULT_PROVIDER
}

export const useFiatDenominationStore = create<FiatDenominationState>()(
  persist(
    (set) => ({
      fiatDenominationMode: false,
      defaultFiatCurrency: DEFAULT_FIAT,
      fiatRateProvider: DEFAULT_PROVIDER,
      setFiatDenominationMode: (fiatDenominationMode) => set({ fiatDenominationMode }),
      setDefaultFiatCurrency: (defaultFiatCurrency) =>
        set({ defaultFiatCurrency }),
      setFiatRateProvider: (fiatRateProvider) => set({ fiatRateProvider }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (s) => ({
        fiatDenominationMode: s.fiatDenominationMode,
        defaultFiatCurrency: s.defaultFiatCurrency,
        fiatRateProvider: s.fiatRateProvider,
      }),
      onRehydrateStorage: () => (state) => {
        if (state == null) return
        const defaultFiatCurrency = coerceDefaultFiatCurrency(
          state.defaultFiatCurrency,
        )
        const fiatRateProvider = coerceFiatRateProvider(state.fiatRateProvider)
        if (
          defaultFiatCurrency !== state.defaultFiatCurrency ||
          fiatRateProvider !== state.fiatRateProvider
        ) {
          useFiatDenominationStore.setState({
            defaultFiatCurrency,
            fiatRateProvider,
          })
        }
      },
    },
  ),
)

export function getDefaultFiatCurrencyStatic(): SupportedDefaultFiatCurrency {
  return DEFAULT_FIAT
}
