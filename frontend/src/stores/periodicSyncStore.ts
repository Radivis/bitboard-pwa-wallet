import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { DashboardRailId } from '@/components/wallet/RailSyncControl'
import {
  DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS,
  MAX_PERIODIC_SYNC_INTERVAL_SECONDS,
  MIN_PERIODIC_SYNC_INTERVAL_SECONDS,
} from '@/lib/wallet/periodic-sync/periodic-sync-constants'

export type PeriodicSyncRailSettings = {
  isEnabled: boolean
  intervalSeconds: number
}

export type PeriodicSyncRailState = Record<DashboardRailId, PeriodicSyncRailSettings>

function clampIntervalSeconds(seconds: number): number {
  return Math.min(
    MAX_PERIODIC_SYNC_INTERVAL_SECONDS,
    Math.max(MIN_PERIODIC_SYNC_INTERVAL_SECONDS, Math.round(seconds)),
  )
}

function defaultRailSettings(): PeriodicSyncRailSettings {
  return {
    isEnabled: true,
    intervalSeconds: DEFAULT_PERIODIC_SYNC_INTERVAL_SECONDS,
  }
}

function defaultPeriodicSyncRailState(): PeriodicSyncRailState {
  return {
    onchain: defaultRailSettings(),
    lightning: defaultRailSettings(),
    arkade: defaultRailSettings(),
  }
}

interface PeriodicSyncState {
  rails: PeriodicSyncRailState
  setRailPeriodicSyncEnabled: (rail: DashboardRailId, enabled: boolean) => void
  setRailPeriodicSyncIntervalSeconds: (rail: DashboardRailId, intervalSeconds: number) => void
}

export const usePeriodicSyncStore = create<PeriodicSyncState>()(
  persist(
    (set) => ({
      rails: defaultPeriodicSyncRailState(),
      setRailPeriodicSyncEnabled: (rail, enabled) =>
        set((state) => ({
          rails: {
            ...state.rails,
            [rail]: { ...state.rails[rail], isEnabled: enabled },
          },
        })),
      setRailPeriodicSyncIntervalSeconds: (rail, intervalSeconds) =>
        set((state) => ({
          rails: {
            ...state.rails,
            [rail]: {
              ...state.rails[rail],
              intervalSeconds: clampIntervalSeconds(intervalSeconds),
            },
          },
        })),
    }),
    {
      name: 'periodic-sync-storage',
      storage: createJSONStorage(() => sqliteStorage),
      version: 1,
      partialize: (state) => ({ rails: state.rails }),
      migrate: (persistedState) => {
        if (persistedState == null || typeof persistedState !== 'object') {
          return { rails: defaultPeriodicSyncRailState() }
        }
        const persisted = persistedState as { rails?: Partial<PeriodicSyncRailState> }
        const defaults = defaultPeriodicSyncRailState()
        const rails = persisted.rails ?? {}
        return {
          rails: {
            onchain: { ...defaults.onchain, ...rails.onchain },
            lightning: { ...defaults.lightning, ...rails.lightning },
            arkade: { ...defaults.arkade, ...rails.arkade },
          },
        }
      },
    },
  ),
)

export { clampIntervalSeconds }
