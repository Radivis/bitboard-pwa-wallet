import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import {
  unilateralExitWalletScopeKey,
  type PersistedUnilateralExitJob,
  type UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

function defaultPersistedJob(): PersistedUnilateralExitJob {
  return {
    selectedLeafOutpoints: [],
    jobActive: false,
  }
}

interface UnilateralExitLifecyclePersistenceState {
  jobsByKey: Record<string, PersistedUnilateralExitJob>
  getJob: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => PersistedUnilateralExitJob
  setActiveJob: (
    scope: UnilateralExitWalletScope,
    selectedLeafOutpoints: ArkadeVtxoOutpoint[],
  ) => void
  clearJob: (scope: UnilateralExitWalletScope) => void
}

function updateJob(
  state: UnilateralExitLifecyclePersistenceState,
  key: string,
  updater: (job: PersistedUnilateralExitJob) => PersistedUnilateralExitJob,
): Partial<UnilateralExitLifecyclePersistenceState> {
  const current = state.jobsByKey[key] ?? defaultPersistedJob()
  return {
    jobsByKey: {
      ...state.jobsByKey,
      [key]: updater(current),
    },
  }
}

export const useUnilateralExitLifecyclePersistenceStore =
  create<UnilateralExitLifecyclePersistenceState>()(
    persist(
      (set, get) => ({
        jobsByKey: {},

        getJob: (walletId, networkMode, connectionId) => {
          const key = unilateralExitWalletScopeKey({ walletId, networkMode, connectionId })
          return get().jobsByKey[key] ?? defaultPersistedJob()
        },

        setActiveJob: (scope, selectedLeafOutpoints) => {
          const key = unilateralExitWalletScopeKey(scope)
          const sorted = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
          set((state) =>
            updateJob(state, key, () => ({
              selectedLeafOutpoints: sorted,
              jobActive: true,
            })),
          )
        },

        clearJob: (scope) => {
          const key = unilateralExitWalletScopeKey(scope)
          set((state) =>
            updateJob(state, key, () => ({
              selectedLeafOutpoints: [],
              jobActive: false,
            })),
          )
        },
      }),
      {
        name: 'unilateral-exit-lifecycle-storage',
        storage: createJSONStorage(() => sqliteStorage),
        version: 1,
        migrate: (persistedState) => persistedState,
        partialize: (state) => ({ jobsByKey: state.jobsByKey }),
      },
    ),
  )

export function getPersistedUnilateralExitJob(
  scope: UnilateralExitWalletScope,
): PersistedUnilateralExitJob {
  return useUnilateralExitLifecyclePersistenceStore
    .getState()
    .getJob(scope.walletId, scope.networkMode, scope.connectionId)
}

export function persistActiveUnilateralExitJob(
  scope: UnilateralExitWalletScope,
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): void {
  useUnilateralExitLifecyclePersistenceStore
    .getState()
    .setActiveJob(scope, selectedLeafOutpoints)
}

export function clearPersistedUnilateralExitJob(scope: UnilateralExitWalletScope): void {
  useUnilateralExitLifecyclePersistenceStore.getState().clearJob(scope)
}
