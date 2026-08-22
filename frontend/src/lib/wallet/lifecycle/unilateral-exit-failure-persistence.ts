import { create } from 'zustand'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import {
  unilateralExitWalletScopeKey,
  type PersistedUnilateralExitFailure,
  type UnilateralExitFailureReasonCode,
  type UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { scheduleUnilateralExitFailureSdkWrite } from '@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence'

interface UnilateralExitFailurePersistenceState {
  failuresByKey: Record<string, PersistedUnilateralExitFailure>
  getFailure: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => PersistedUnilateralExitFailure | null
  hydrateFailure: (
    scope: UnilateralExitWalletScope,
    failure: PersistedUnilateralExitFailure | null,
  ) => void
  persistFailure: (scope: UnilateralExitWalletScope, failure: PersistedUnilateralExitFailure) => void
  clearFailure: (scope: UnilateralExitWalletScope) => void
  clearScope: (scope: UnilateralExitWalletScope) => void
}

export const useUnilateralExitFailurePersistenceStore =
  create<UnilateralExitFailurePersistenceState>()((set, get) => ({
    failuresByKey: {},

    getFailure: (walletId, networkMode, connectionId) => {
      const key = unilateralExitWalletScopeKey({ walletId, networkMode, connectionId })
      return get().failuresByKey[key] ?? null
    },

    hydrateFailure: (scope, failure) => {
      const key = unilateralExitWalletScopeKey(scope)
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
      const key = unilateralExitWalletScopeKey(scope)
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
      const key = unilateralExitWalletScopeKey(scope)
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
      const key = unilateralExitWalletScopeKey(scope)
      set((state) => {
        const failuresByKey = { ...state.failuresByKey }
        delete failuresByKey[key]
        return { failuresByKey }
      })
    },
  }))

export function getPersistedUnilateralExitFailure(
  scope: UnilateralExitWalletScope,
): PersistedUnilateralExitFailure | null {
  return useUnilateralExitFailurePersistenceStore
    .getState()
    .getFailure(scope.walletId, scope.networkMode, scope.connectionId)
}

export function persistUnilateralExitFailureRecord(
  scope: UnilateralExitWalletScope,
  failure: PersistedUnilateralExitFailure,
): void {
  useUnilateralExitFailurePersistenceStore.getState().persistFailure(scope, failure)
}

export function clearPersistedUnilateralExitFailure(scope: UnilateralExitWalletScope): void {
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
