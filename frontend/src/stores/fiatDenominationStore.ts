import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  coerceStoredFiatCurrencyCode,
  DEFAULT_FIAT_FALLBACK,
  type FiatCurrencyCode,
} from '@/lib/supported-fiat-currencies'
import type { FiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'
import { isKnownFiatRateProviderId } from '@/lib/fiat-rate-service-whitelist'

const STORAGE_KEY = 'fiat-denomination-storage'

const DEFAULT_PROVIDER: FiatRateProviderId = 'kraken'

interface FiatDenominationState {
  fiatDenominationMode: boolean
  defaultFiatCurrency: FiatCurrencyCode
  fiatRateProvider: FiatRateProviderId
  setFiatDenominationMode: (v: boolean) => void
  setDefaultFiatCurrency: (c: FiatCurrencyCode) => void
  setFiatRateProvider: (p: FiatRateProviderId) => void
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
      defaultFiatCurrency: DEFAULT_FIAT_FALLBACK,
      fiatRateProvider: DEFAULT_PROVIDER,
      setFiatDenominationMode: (fiatDenominationMode) => set({ fiatDenominationMode }),
      setDefaultFiatCurrency: (defaultFiatCurrency) =>
        set({ defaultFiatCurrency: coerceStoredFiatCurrencyCode(defaultFiatCurrency) }),
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
        const defaultFiatCurrency = coerceStoredFiatCurrencyCode(
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

export function getDefaultFiatCurrencyStatic(): FiatCurrencyCode {
  return DEFAULT_FIAT_FALLBACK
}
