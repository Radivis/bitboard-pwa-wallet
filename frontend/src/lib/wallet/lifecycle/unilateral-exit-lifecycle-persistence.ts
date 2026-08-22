import { create } from 'zustand'
import type { NetworkMode } from '@/stores/walletStore'
import {
  arkadeVtxoOutpointCacheKey,
  sortArkadeVtxoOutpoints,
  type ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import {
  unilateralExitWalletScopeKey,
  type PersistedUnilateralExitJob,
  type UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { scheduleUnilateralExitJobSdkWrite } from '@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence'

export const emptyPersistedUnilateralExitJob: PersistedUnilateralExitJob = {
  selectedLeafOutpoints: [],
  currentStepRelayedSinceUnix: null,
  jobStartedAtUnix: null,
}

function defaultPersistedJob(): PersistedUnilateralExitJob {
  return emptyPersistedUnilateralExitJob
}

function newActivePersistedJob(
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): PersistedUnilateralExitJob {
  return {
    selectedLeafOutpoints,
    currentStepRelayedSinceUnix: null,
    jobStartedAtUnix: Math.floor(Date.now() / 1000),
  }
}

function persistedJobOutpointsUnchanged(
  current: PersistedUnilateralExitJob,
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): boolean {
  return (
    current.selectedLeafOutpoints.length > 0 &&
    arkadeVtxoOutpointCacheKey(current.selectedLeafOutpoints) ===
      arkadeVtxoOutpointCacheKey(selectedLeafOutpoints)
  )
}

interface UnilateralExitLifecyclePersistenceState {
  jobsByKey: Record<string, PersistedUnilateralExitJob>
  hydratedByKey: Record<string, boolean>
  getJob: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => PersistedUnilateralExitJob
  isHydrated: (scope: UnilateralExitWalletScope) => boolean
  markHydrated: (scope: UnilateralExitWalletScope) => void
  hydrateJob: (scope: UnilateralExitWalletScope, job: PersistedUnilateralExitJob) => void
  setActiveJob: (
    scope: UnilateralExitWalletScope,
    selectedLeafOutpoints: ArkadeVtxoOutpoint[],
  ) => void
  ensureActiveJob: (
    scope: UnilateralExitWalletScope,
    selectedLeafOutpoints: ArkadeVtxoOutpoint[],
  ) => void
  updateRelayWait: (scope: UnilateralExitWalletScope, sinceUnix: number | null) => void
  clearJob: (scope: UnilateralExitWalletScope) => void
  clearScope: (scope: UnilateralExitWalletScope) => void
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
  create<UnilateralExitLifecyclePersistenceState>()((set, get) => ({
    jobsByKey: {},
    hydratedByKey: {},

    getJob: (walletId, networkMode, connectionId) => {
      const key = unilateralExitWalletScopeKey({ walletId, networkMode, connectionId })
      return get().jobsByKey[key] ?? defaultPersistedJob()
    },

    isHydrated: (scope) => {
      const key = unilateralExitWalletScopeKey(scope)
      return get().hydratedByKey[key] === true
    },

    markHydrated: (scope) => {
      const key = unilateralExitWalletScopeKey(scope)
      set((state) => ({
        hydratedByKey: { ...state.hydratedByKey, [key]: true },
      }))
    },

    hydrateJob: (scope, job) => {
      const key = unilateralExitWalletScopeKey(scope)
      set((state) => ({
        jobsByKey: { ...state.jobsByKey, [key]: job },
        hydratedByKey: { ...state.hydratedByKey, [key]: true },
      }))
    },

    setActiveJob: (scope, selectedLeafOutpoints) => {
      const key = unilateralExitWalletScopeKey(scope)
      const sorted = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
      set((state) => updateJob(state, key, () => newActivePersistedJob(sorted)))
    },

    ensureActiveJob: (scope, selectedLeafOutpoints) => {
      const key = unilateralExitWalletScopeKey(scope)
      const sorted = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
      set((state) => {
        const current = state.jobsByKey[key] ?? defaultPersistedJob()
        if (persistedJobOutpointsUnchanged(current, sorted)) {
          return state
        }
        return updateJob(state, key, () => newActivePersistedJob(sorted))
      })
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
      set((state) => updateJob(state, key, () => emptyPersistedUnilateralExitJob))
    },

    clearScope: (scope) => {
      const key = unilateralExitWalletScopeKey(scope)
      set((state) => {
        const jobsByKey = { ...state.jobsByKey }
        const hydratedByKey = { ...state.hydratedByKey }
        delete jobsByKey[key]
        delete hydratedByKey[key]
        return { jobsByKey, hydratedByKey }
      })
    },
  }))

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
  scheduleUnilateralExitJobSdkWrite(scope)
}

export function ensurePersistedUnilateralExitJob(
  scope: UnilateralExitWalletScope,
  selectedLeafOutpoints: ArkadeVtxoOutpoint[],
): void {
  const before = getPersistedUnilateralExitJob(scope)
  useUnilateralExitLifecyclePersistenceStore
    .getState()
    .ensureActiveJob(scope, selectedLeafOutpoints)
  const after = getPersistedUnilateralExitJob(scope)
  if (
    before.jobStartedAtUnix !== after.jobStartedAtUnix ||
    before.currentStepRelayedSinceUnix !== after.currentStepRelayedSinceUnix ||
    arkadeVtxoOutpointCacheKey(before.selectedLeafOutpoints) !==
      arkadeVtxoOutpointCacheKey(after.selectedLeafOutpoints)
  ) {
    scheduleUnilateralExitJobSdkWrite(scope)
  }
}

export function updatePersistedUnilateralExitRelayWait(
  scope: UnilateralExitWalletScope,
  sinceUnix: number | null,
): void {
  const current = getPersistedUnilateralExitJob(scope)
  if (current.currentStepRelayedSinceUnix === sinceUnix) {
    return
  }
  useUnilateralExitLifecyclePersistenceStore
    .getState()
    .updateRelayWait(scope, sinceUnix)
  scheduleUnilateralExitJobSdkWrite(scope)
}

export function clearPersistedUnilateralExitJob(scope: UnilateralExitWalletScope): void {
  useUnilateralExitLifecyclePersistenceStore.getState().clearJob(scope)
  scheduleUnilateralExitJobSdkWrite(scope)
}
