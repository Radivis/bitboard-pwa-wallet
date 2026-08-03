import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import {
  unilateralExitWalletScopeKey,
  type PersistedUnilateralExitFailure,
  type UnilateralExitFailureReasonCode,
  type UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

interface UnilateralExitFailurePersistenceState {
  failuresByKey: Record<string, PersistedUnilateralExitFailure>
  getFailure: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => PersistedUnilateralExitFailure | null
  persistFailure: (scope: UnilateralExitWalletScope, failure: PersistedUnilateralExitFailure) => void
  clearFailure: (scope: UnilateralExitWalletScope) => void
}

export const useUnilateralExitFailurePersistenceStore =
  create<UnilateralExitFailurePersistenceState>()(
    persist(
      (set, get) => ({
        failuresByKey: {},

        getFailure: (walletId, networkMode, connectionId) => {
          const key = unilateralExitWalletScopeKey({ walletId, networkMode, connectionId })
          return get().failuresByKey[key] ?? null
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
        },
      }),
      {
        name: 'unilateral-exit-failure-storage',
        storage: createJSONStorage(() => sqliteStorage),
        version: 1,
      },
    ),
  )

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
}): PersistedUnilateralExitFailure {
  return {
    selectedLeafOutpoints: params.selectedLeafOutpoints,
    jobStartedAtUnix: params.jobStartedAtUnix,
    detectedAtUnix: Math.floor(Date.now() / 1000),
    reasonCode: params.reasonCode,
    detailMessage: params.detailMessage,
  }
}
