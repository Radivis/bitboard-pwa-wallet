import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { isBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { appQueryClient } from '@/lib/app-query-client'
import { bitcoinUnitQueryKey } from '@/lib/bitcoin-unit-query'

const STORAGE_KEY = 'bitcoin-display-unit-storage'

interface BitcoinDisplayUnitState {
  defaultBitcoinUnit: BitcoinDisplayUnit
  setDefaultBitcoinUnit: (unit: BitcoinDisplayUnit) => void
}

function syncQueryCache(unit: BitcoinDisplayUnit) {
  appQueryClient.setQueryData(bitcoinUnitQueryKey, unit)
}

export const useBitcoinDisplayUnitStore = create<BitcoinDisplayUnitState>()(
  persist(
    (set) => ({
      defaultBitcoinUnit: 'BTC',
      setDefaultBitcoinUnit: (unit) => {
        set({ defaultBitcoinUnit: unit })
        syncQueryCache(unit)
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (s) => ({ defaultBitcoinUnit: s.defaultBitcoinUnit }),
      onRehydrateStorage: () => (state) => {
        if (state != null && isBitcoinDisplayUnit(state.defaultBitcoinUnit)) {
          syncQueryCache(state.defaultBitcoinUnit)
        }
      },
    },
  ),
)
