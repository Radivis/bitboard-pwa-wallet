import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import type { NetworkMode } from '@/stores/walletStore'
import {
  defaultUnilateralExitAutomationPrefs,
  unilateralExitAutomationPrefsKey,
  type UnilateralExitAutomationPrefs,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'

interface UnilateralExitAutomationPrefsState {
  prefsByKey: Record<string, UnilateralExitAutomationPrefs>
  getPrefs: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => UnilateralExitAutomationPrefs
  setEnabled: (scope: UnilateralExitWalletScope, enabled: boolean, defaultMaxFee?: number) => void
  setFeePresetLabel: (scope: UnilateralExitWalletScope, feePresetLabel: SendFeePresetLabel) => void
  setMaxFeeRateSatPerVb: (scope: UnilateralExitWalletScope, maxFeeRateSatPerVb: number) => void
}

function updatePrefs(
  state: UnilateralExitAutomationPrefsState,
  key: string,
  updater: (prefs: UnilateralExitAutomationPrefs) => UnilateralExitAutomationPrefs,
): Partial<UnilateralExitAutomationPrefsState> {
  const current = state.prefsByKey[key] ?? defaultUnilateralExitAutomationPrefs()
  return {
    prefsByKey: {
      ...state.prefsByKey,
      [key]: updater(current),
    },
  }
}

export const useUnilateralExitAutomationPrefsStore = create<UnilateralExitAutomationPrefsState>()(
  persist(
    (set, get) => ({
      prefsByKey: {},

      getPrefs: (walletId, networkMode, connectionId) => {
        const key = unilateralExitAutomationPrefsKey({ walletId, networkMode, connectionId })
        return get().prefsByKey[key] ?? defaultUnilateralExitAutomationPrefs()
      },

      setEnabled: (scope, enabled, defaultMaxFee) => {
        const key = unilateralExitAutomationPrefsKey(scope)
        set((state) =>
          updatePrefs(state, key, (prefs) => ({
            ...prefs,
            enabled,
            ...(enabled && defaultMaxFee != null ? { maxFeeRateSatPerVb: defaultMaxFee } : {}),
          })),
        )
      },

      setFeePresetLabel: (scope, feePresetLabel) => {
        const key = unilateralExitAutomationPrefsKey(scope)
        set((state) => updatePrefs(state, key, (prefs) => ({ ...prefs, feePresetLabel })))
      },

      setMaxFeeRateSatPerVb: (scope, maxFeeRateSatPerVb) => {
        if (!Number.isFinite(maxFeeRateSatPerVb) || maxFeeRateSatPerVb <= 0) return
        const key = unilateralExitAutomationPrefsKey(scope)
        set((state) =>
          updatePrefs(state, key, (prefs) => ({ ...prefs, maxFeeRateSatPerVb })),
        )
      },
    }),
    {
      name: 'unilateral-exit-automation-prefs',
      storage: createJSONStorage(() => sqliteStorage),
      version: 1,
      migrate: (persistedState) => persistedState,
      partialize: (state) => ({ prefsByKey: state.prefsByKey }),
    },
  ),
)
