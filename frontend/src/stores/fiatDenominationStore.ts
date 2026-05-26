import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  coerceStoredFiatCurrencyCode,
  DEFAULT_FIAT_FALLBACK,
  type FiatCurrencyCode,
} from '@/lib/fiat/supported-fiat-currencies'
import type { FiatRateProviderId } from '@/lib/fiat/fiat-rate-service-whitelist'
import { isKnownFiatRateProviderId } from '@/lib/fiat/fiat-rate-service-whitelist'
import { clampDefaultFiatCurrencyToProviderDiscovery } from '@/stores/fiat-denomination-clamp'

const STORAGE_KEY = 'fiat-denomination-storage'

const DEFAULT_PROVIDER: FiatRateProviderId = 'kraken'

interface FiatDenominationState {
  fiatDenominationMode: boolean
  defaultFiatCurrency: FiatCurrencyCode
  fiatRateProvider: FiatRateProviderId
  setFiatDenominationMode: (nextFiatDenominationMode: boolean) => void
  setDefaultFiatCurrency: (fiatCurrencyCode: FiatCurrencyCode) => void
  setFiatRateProvider: (nextFiatRateProviderId: FiatRateProviderId) => void
}

function coerceFiatRateProvider(rawPersistedValue: unknown): FiatRateProviderId {
  return typeof rawPersistedValue === 'string' && isKnownFiatRateProviderId(rawPersistedValue)
    ? rawPersistedValue
    : DEFAULT_PROVIDER
}

function scheduleClampDefaultFiatToProviderDiscovery(
  fiatRateProviderId: FiatRateProviderId,
): void {
  void clampDefaultFiatCurrencyToProviderDiscovery(
    fiatRateProviderId,
    () => useFiatDenominationStore.getState(),
    () =>
      useFiatDenominationStore.setState({
        defaultFiatCurrency: DEFAULT_FIAT_FALLBACK,
      }),
  )
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
      setFiatRateProvider: (nextFiatRateProviderId) => {
        if (!isKnownFiatRateProviderId(nextFiatRateProviderId)) return
        set({ fiatRateProvider: nextFiatRateProviderId })
        scheduleClampDefaultFiatToProviderDiscovery(nextFiatRateProviderId)
      },
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
        scheduleClampDefaultFiatToProviderDiscovery(fiatRateProvider)
      },
    },
  ),
)

export function getDefaultFiatCurrencyStatic(): FiatCurrencyCode {
  return DEFAULT_FIAT_FALLBACK
}
