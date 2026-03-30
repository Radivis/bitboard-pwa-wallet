import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'

interface FeatureState {
  lightningEnabled: boolean
  setLightningEnabled: (enabled: boolean) => void
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      lightningEnabled: false,
      setLightningEnabled: (enabled) => set({ lightningEnabled: enabled }),
    }),
    {
      name: 'feature-storage',
      storage: createJSONStorage(() => sqliteStorage),
    },
  ),
)
