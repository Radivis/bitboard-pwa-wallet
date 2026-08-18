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

type LegacyPersistedJob = {
  selectedLeafOutpoints?: ArkadeVtxoOutpoint[]
  currentStepRelayedSinceUnix?: number | null
  jobStartedAtUnix?: number | null
  expectedTotalSteps?: number | null
  jobActive?: boolean
  suppressHydrateResume?: boolean
}

/** v5: a job exists iff outpoints are present. Inactive v4 rows (and abort leftovers) become empty. */
export function migratePersistedUnilateralExitJob(
  job: LegacyPersistedJob,
): PersistedUnilateralExitJob {
  const selectedLeafOutpoints = job.selectedLeafOutpoints ?? []
  const inactive =
    job.jobActive === false ||
    job.suppressHydrateResume === true ||
    selectedLeafOutpoints.length === 0
  if (inactive) {
    return emptyPersistedUnilateralExitJob
  }
  return {
    selectedLeafOutpoints,
    currentStepRelayedSinceUnix: job.currentStepRelayedSinceUnix ?? null,
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
        version: 5,
        migrate: (persistedState, _version) => {
          const state = persistedState as {
            jobsByKey?: Record<string, LegacyPersistedJob>
          }
          if (state.jobsByKey == null) {
            return persistedState
          }
          const jobsByKey = Object.fromEntries(
            Object.entries(state.jobsByKey).map(([key, job]) => [
              key,
              migratePersistedUnilateralExitJob(job),
            ]),
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
