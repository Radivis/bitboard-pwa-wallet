import { create } from 'zustand'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import { arkadeWalletScopeKey, type ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import type {
  PersistedUnilateralExitFailure,
  UnilateralExitFailureReasonCode,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { scheduleUnilateralExitFailureSdkWrite } from '@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence'

interface UnilateralExitFailurePersistenceState {
  failuresByKey: Record<string, PersistedUnilateralExitFailure>
  getFailure: (
    walletId: number,
    networkMode: NetworkMode,
    arkadeAccountId: string,
  ) => PersistedUnilateralExitFailure | null
  hydrateFailure: (
    scope: ArkadeWalletScope,
    failure: PersistedUnilateralExitFailure | null,
  ) => void
  persistFailure: (scope: ArkadeWalletScope, failure: PersistedUnilateralExitFailure) => void
  clearFailure: (scope: ArkadeWalletScope) => void
  clearScope: (scope: ArkadeWalletScope) => void
}

export const useUnilateralExitFailurePersistenceStore =
  create<UnilateralExitFailurePersistenceState>()((set, get) => ({
    failuresByKey: {},

    getFailure: (walletId, networkMode, arkadeAccountId) => {
      const key = arkadeWalletScopeKey({ walletId, networkMode, arkadeAccountId })
      return get().failuresByKey[key] ?? null
    },

    hydrateFailure: (scope, failure) => {
      const key = arkadeWalletScopeKey(scope)
      set((state) => {
        const failuresByKey = { ...state.failuresByKey }
        if (failure == null) {
          delete failuresByKey[key]
        } else {
          failuresByKey[key] = failure
        }
        return { failuresByKey }
      })
    },

    persistFailure: (scope, failure) => {
      const key = arkadeWalletScopeKey(scope)
      const sortedOutpoints = sortArkadeVtxoOutpoints(failure.selectedLeafOutpoints)
      set((state) => ({
        failuresByKey: {
          ...state.failuresByKey,
          [key]: {
            ...failure,
            selectedLeafOutpoints: sortedOutpoints,
          },
        },
      }))
      scheduleUnilateralExitFailureSdkWrite(scope)
    },

    clearFailure: (scope) => {
      const key = arkadeWalletScopeKey(scope)
      set((state) => {
        if (state.failuresByKey[key] == null) {
          return state
        }
        const failuresByKey = { ...state.failuresByKey }
        delete failuresByKey[key]
        return { failuresByKey }
      })
      scheduleUnilateralExitFailureSdkWrite(scope)
    },

    clearScope: (scope) => {
      const key = arkadeWalletScopeKey(scope)
      set((state) => {
        const failuresByKey = { ...state.failuresByKey }
        delete failuresByKey[key]
        return { failuresByKey }
      })
    },
  }))

export function getPersistedUnilateralExitFailure(
  scope: ArkadeWalletScope,
): PersistedUnilateralExitFailure | null {
  return useUnilateralExitFailurePersistenceStore
    .getState()
    .getFailure(scope.walletId, scope.networkMode, scope.arkadeAccountId)
}

export function persistUnilateralExitFailureRecord(
  scope: ArkadeWalletScope,
  failure: PersistedUnilateralExitFailure,
): void {
  useUnilateralExitFailurePersistenceStore.getState().persistFailure(scope, failure)
}

export function clearPersistedUnilateralExitFailure(scope: ArkadeWalletScope): void {
  useUnilateralExitFailurePersistenceStore.getState().clearFailure(scope)
}

export function buildPersistedUnilateralExitFailure(params: {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStartedAtUnix: number
  reasonCode: UnilateralExitFailureReasonCode
  detailMessage: string
  vtxoIds?: string[]
}): PersistedUnilateralExitFailure {
  return {
    selectedLeafOutpoints: params.selectedLeafOutpoints,
    jobStartedAtUnix: params.jobStartedAtUnix,
    detectedAtUnix: Math.floor(Date.now() / 1000),
    reasonCode: params.reasonCode,
    detailMessage: params.detailMessage,
    vtxoIds: params.vtxoIds ?? [],
  }
}
