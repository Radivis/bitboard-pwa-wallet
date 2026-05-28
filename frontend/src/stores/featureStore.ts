import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'

interface FeatureState {
  isLightningEnabled: boolean
  setIsLightningEnabled: (enabled: boolean) => void
  /** When false, Mainnet cannot be selected until enabled under Settings → Features. */
  isMainnetAccessEnabled: boolean
  setIsMainnetAccessEnabled: (enabled: boolean) => void
  /** When false, Regtest cannot be selected until enabled under Settings → Features (developer use). */
  isRegtestModeEnabled: boolean
  setIsRegtestModeEnabled: (enabled: boolean) => void
  /**
   * When false (default), the wallet stays Taproot-first UX: no SegWit-vs-Taproot pickers or badges.
   * When true, users can choose SegWit (BIP84) vs Taproot (BIP86) in Settings and see related labels.
   */
  isSegwitAddressesEnabled: boolean
  setIsSegwitAddressesEnabled: (enabled: boolean) => void
}

type LegacyFeaturePersistedState = {
  lightningEnabled?: boolean
  mainnetAccessEnabled?: boolean
  regtestModeEnabled?: boolean
  segwitAddressesEnabled?: boolean
}

function migrateLegacyFeatureState(persistedState: unknown): Partial<FeatureState> | undefined {
  if (persistedState == null || typeof persistedState !== 'object') {
    return undefined
  }
  const legacy = persistedState as LegacyFeaturePersistedState & Partial<FeatureState>
  if ('isLightningEnabled' in legacy) {
    return legacy
  }
  return {
    isLightningEnabled: legacy.lightningEnabled ?? false,
    isMainnetAccessEnabled: legacy.mainnetAccessEnabled ?? false,
    isRegtestModeEnabled: legacy.regtestModeEnabled ?? false,
    isSegwitAddressesEnabled: legacy.segwitAddressesEnabled ?? false,
  }
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      isLightningEnabled: false,
      setIsLightningEnabled: (enabled) => set({ isLightningEnabled: enabled }),
      isMainnetAccessEnabled: false,
      setIsMainnetAccessEnabled: (enabled) => set({ isMainnetAccessEnabled: enabled }),
      isRegtestModeEnabled: false,
      setIsRegtestModeEnabled: (enabled) => set({ isRegtestModeEnabled: enabled }),
      isSegwitAddressesEnabled: false,
      setIsSegwitAddressesEnabled: (enabled) => set({ isSegwitAddressesEnabled: enabled }),
    }),
    {
      name: 'feature-storage',
      storage: createJSONStorage(() => sqliteStorage),
      version: 1,
      migrate: (persistedState) => migrateLegacyFeatureState(persistedState) ?? persistedState,
      partialize: (state) => ({
        isLightningEnabled: state.isLightningEnabled,
        isMainnetAccessEnabled: state.isMainnetAccessEnabled,
        isRegtestModeEnabled: state.isRegtestModeEnabled,
        isSegwitAddressesEnabled: state.isSegwitAddressesEnabled,
      }),
    },
  ),
)
