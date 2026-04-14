import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'

interface FeatureState {
  lightningEnabled: boolean
  setLightningEnabled: (enabled: boolean) => void
  /** When false, Mainnet cannot be selected until enabled under Settings → Features. */
  mainnetAccessEnabled: boolean
  setMainnetAccessEnabled: (enabled: boolean) => void
  /** When false, Regtest cannot be selected until enabled under Settings → Features (developer use). */
  regtestModeEnabled: boolean
  setRegtestModeEnabled: (enabled: boolean) => void
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      lightningEnabled: false,
      setLightningEnabled: (enabled) => set({ lightningEnabled: enabled }),
      mainnetAccessEnabled: false,
      setMainnetAccessEnabled: (enabled) => set({ mainnetAccessEnabled: enabled }),
      regtestModeEnabled: false,
      setRegtestModeEnabled: (enabled) => set({ regtestModeEnabled: enabled }),
    }),
    {
      name: 'feature-storage',
      storage: createJSONStorage(() => sqliteStorage),
    },
  ),
)
