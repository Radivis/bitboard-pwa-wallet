import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

export type UnilateralExitAutomationPausedReason =
  | 'feeCapExceeded'
  | 'bumperInsufficient'
  | 'error'
  | 'userDisabled'

export type UnilateralExitAutomationJob = {
  proceedAutomatically: boolean
  feePresetLabel: SendFeePresetLabel
  maxFeeRateSatPerVb: number
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStarted: boolean
  pausedReason?: UnilateralExitAutomationPausedReason
  lastErrorMessage?: string
}

export function unilateralExitAutomationJobKey(
  walletId: number,
  networkMode: NetworkMode,
  arkadeConnectionId: string,
): string {
  return `${walletId}:${networkMode}:${arkadeConnectionId}`
}

function defaultAutomationJob(): UnilateralExitAutomationJob {
  return {
    proceedAutomatically: false,
    feePresetLabel: 'Medium',
    maxFeeRateSatPerVb: 10,
    selectedLeafOutpoints: [],
    jobStarted: false,
  }
}

interface UnilateralExitAutomationState {
  jobsByKey: Record<string, UnilateralExitAutomationJob>
  getJob: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
  ) => UnilateralExitAutomationJob
  setProceedAutomatically: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    enabled: boolean,
    defaultMaxFeeRateSatPerVb?: number,
  ) => void
  setFeePresetLabel: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    feePresetLabel: SendFeePresetLabel,
  ) => void
  setMaxFeeRateSatPerVb: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    maxFeeRateSatPerVb: number,
  ) => void
  syncSelectedLeafOutpoints: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    selectedLeafOutpoints: ArkadeVtxoOutpoint[],
  ) => void
  startJob: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    selectedLeafOutpoints: ArkadeVtxoOutpoint[],
    proceedAutomatically: boolean,
  ) => void
  pauseJob: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
    pausedReason: UnilateralExitAutomationPausedReason,
    lastErrorMessage?: string,
  ) => void
  clearPause: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
  ) => void
  completeJob: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
  ) => void
  hydrateJobFromPersisted: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeConnectionId: string,
  ) => UnilateralExitAutomationJob | null
}

function updateJob(
  state: UnilateralExitAutomationState,
  key: string,
  updater: (job: UnilateralExitAutomationJob) => UnilateralExitAutomationJob,
): Partial<UnilateralExitAutomationState> {
  const current = state.jobsByKey[key] ?? defaultAutomationJob()
  return {
    jobsByKey: {
      ...state.jobsByKey,
      [key]: updater(current),
    },
  }
}

export const useUnilateralExitAutomationStore = create<UnilateralExitAutomationState>()(
  persist(
    (set, get) => ({
      jobsByKey: {},

      getJob: (walletId, networkMode, arkadeConnectionId) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        return get().jobsByKey[key] ?? defaultAutomationJob()
      },

      setProceedAutomatically: (
        walletId,
        networkMode,
        arkadeConnectionId,
        enabled,
        defaultMaxFeeRate,
      ) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            proceedAutomatically: enabled,
            ...(enabled && defaultMaxFeeRate != null
              ? { maxFeeRateSatPerVb: defaultMaxFeeRate }
              : {}),
            ...(enabled
              ? { pausedReason: undefined, lastErrorMessage: undefined }
              : job.jobStarted
                ? { pausedReason: 'userDisabled' as const, lastErrorMessage: undefined }
                : { pausedReason: undefined, lastErrorMessage: undefined }),
          })),
        )
      },

      setFeePresetLabel: (walletId, networkMode, arkadeConnectionId, feePresetLabel) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        set((state) => updateJob(state, key, (job) => ({ ...job, feePresetLabel })))
      },

      setMaxFeeRateSatPerVb: (walletId, networkMode, arkadeConnectionId, maxFeeRateSatPerVb) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        if (!Number.isFinite(maxFeeRateSatPerVb) || maxFeeRateSatPerVb <= 0) return
        set((state) =>
          updateJob(state, key, (job) => ({ ...job, maxFeeRateSatPerVb })),
        )
      },

      syncSelectedLeafOutpoints: (
        walletId,
        networkMode,
        arkadeConnectionId,
        selectedLeafOutpoints,
      ) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        const sorted = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            selectedLeafOutpoints: sorted,
          })),
        )
      },

      startJob: (
        walletId,
        networkMode,
        arkadeConnectionId,
        selectedLeafOutpoints,
        proceedAutomatically,
      ) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        const sorted = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            proceedAutomatically,
            jobStarted: true,
            selectedLeafOutpoints: sorted,
            pausedReason: undefined,
            lastErrorMessage: undefined,
          })),
        )
      },

      pauseJob: (walletId, networkMode, arkadeConnectionId, pausedReason, lastErrorMessage) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            pausedReason,
            lastErrorMessage,
          })),
        )
      },

      clearPause: (walletId, networkMode, arkadeConnectionId) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            pausedReason: undefined,
            lastErrorMessage: undefined,
          })),
        )
      },

      completeJob: (walletId, networkMode, arkadeConnectionId) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        set((state) =>
          updateJob(state, key, (job) => ({
            ...job,
            jobStarted: false,
            proceedAutomatically: false,
            pausedReason: undefined,
            lastErrorMessage: undefined,
          })),
        )
      },

      hydrateJobFromPersisted: (walletId, networkMode, arkadeConnectionId) => {
        const key = unilateralExitAutomationJobKey(walletId, networkMode, arkadeConnectionId)
        const job = get().jobsByKey[key]
        if (job == null || !job.jobStarted) return null
        return job
      },
    }),
    {
      name: 'unilateral-exit-automation-storage',
      storage: createJSONStorage(() => sqliteStorage),
      version: 3,
      migrate: (persistedState) => persistedState,
      partialize: (state) => ({ jobsByKey: state.jobsByKey }),
    },
  ),
)

export function isUnilateralExitAutomationJobActive(
  job: UnilateralExitAutomationJob,
): boolean {
  return job.proceedAutomatically && job.jobStarted && job.pausedReason == null
}
