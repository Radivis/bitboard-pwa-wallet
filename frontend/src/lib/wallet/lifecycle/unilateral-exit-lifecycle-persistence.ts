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

export const emptyPersistedUnilateralExitJob: PersistedUnilateralExitJob = {
  selectedLeafOutpoints: [],
  jobActive: false,
  currentStepRelayedSinceUnix: null,
  jobStartedAtUnix: null,
}

function defaultPersistedJob(): PersistedUnilateralExitJob {
  return emptyPersistedUnilateralExitJob
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
  updateRelayWait: (scope: UnilateralExitWalletScope, sinceUnix: number | null) => void
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

type LegacyPersistedJob = PersistedUnilateralExitJob & {
  expectedTotalSteps?: number | null
}

function migrateJobToV3(job: LegacyPersistedJob): PersistedUnilateralExitJob {
  return {
    selectedLeafOutpoints: job.selectedLeafOutpoints ?? [],
    jobActive: job.jobActive ?? false,
    currentStepRelayedSinceUnix: job.currentStepRelayedSinceUnix ?? null,
    jobStartedAtUnix: null,
  }
}

function migrateJobToV4(job: LegacyPersistedJob): PersistedUnilateralExitJob {
  const migrated = migrateJobToV3(job)
  return {
    ...migrated,
    jobStartedAtUnix: job.jobStartedAtUnix ?? null,
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
              currentStepRelayedSinceUnix: null,
              jobStartedAtUnix: Math.floor(Date.now() / 1000),
            })),
          )
        },

        updateRelayWait: (scope, sinceUnix) => {
          const key = unilateralExitWalletScopeKey(scope)
          set((state) => {
            const current = state.jobsByKey[key] ?? emptyPersistedUnilateralExitJob
            if (current.currentStepRelayedSinceUnix === sinceUnix) {
              return state
            }
            return updateJob(state, key, (job) => ({
              ...job,
              currentStepRelayedSinceUnix: sinceUnix,
            }))
          })
        },

        clearJob: (scope) => {
          const key = unilateralExitWalletScopeKey(scope)
          set((state) =>
            updateJob(state, key, () => emptyPersistedUnilateralExitJob),
          )
        },
      }),
      {
        name: 'unilateral-exit-lifecycle-storage',
        storage: createJSONStorage(() => sqliteStorage),
        version: 4,
        migrate: (persistedState, version) => {
          const state = persistedState as {
            jobsByKey?: Record<string, LegacyPersistedJob>
          }
          if (state.jobsByKey == null) {
            return persistedState
          }
          const jobsByKey = Object.fromEntries(
            Object.entries(state.jobsByKey).map(([key, job]) => {
              if (version < 3) {
                return [key, migrateJobToV4(migrateJobToV3(job))]
              }
              if (version < 4) {
                return [key, migrateJobToV4(job)]
              }
              return [key, migrateJobToV4(job)]
            }),
          )
          return { ...state, jobsByKey }
        },
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

export function updatePersistedUnilateralExitRelayWait(
  scope: UnilateralExitWalletScope,
  sinceUnix: number | null,
): void {
  useUnilateralExitLifecyclePersistenceStore
    .getState()
    .updateRelayWait(scope, sinceUnix)
}

export function clearPersistedUnilateralExitJob(scope: UnilateralExitWalletScope): void {
  useUnilateralExitLifecyclePersistenceStore.getState().clearJob(scope)
}
