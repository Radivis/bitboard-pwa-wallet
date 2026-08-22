import { create } from 'zustand'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import type { NetworkMode } from '@/stores/walletStore'
import {
  defaultUnilateralExitAutomationPrefs,
  unilateralExitAutomationPrefsKey,
  type UnilateralExitAutomationPrefs,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'
import type { UnilateralExitWalletScope } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { scheduleUnilateralExitPrefsSdkWrite } from '@/lib/wallet/lifecycle/unilateral-exit-frontend-sdk-persistence'

interface UnilateralExitAutomationPrefsState {
  prefsByKey: Record<string, UnilateralExitAutomationPrefs>
  getPrefs: (
    walletId: number,
    networkMode: NetworkMode,
    connectionId: string,
  ) => UnilateralExitAutomationPrefs
  hydratePrefs: (scope: UnilateralExitWalletScope, prefs: UnilateralExitAutomationPrefs) => void
  setEnabled: (scope: UnilateralExitWalletScope, enabled: boolean, defaultMaxFee?: number) => void
  setFeePresetLabel: (scope: UnilateralExitWalletScope, feePresetLabel: SendFeePresetLabel) => void
  setMaxFeeRateSatPerVb: (scope: UnilateralExitWalletScope, maxFeeRateSatPerVb: number) => void
  clearScope: (scope: UnilateralExitWalletScope) => void
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
  (set, get) => ({
    prefsByKey: {},

    getPrefs: (walletId, networkMode, connectionId) => {
      const key = unilateralExitAutomationPrefsKey({ walletId, networkMode, connectionId })
      return get().prefsByKey[key] ?? defaultUnilateralExitAutomationPrefs()
    },

    hydratePrefs: (scope, prefs) => {
      const key = unilateralExitAutomationPrefsKey(scope)
      set((state) => ({
        prefsByKey: { ...state.prefsByKey, [key]: prefs },
      }))
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
      scheduleUnilateralExitPrefsSdkWrite(scope)
    },

    setFeePresetLabel: (scope, feePresetLabel) => {
      const key = unilateralExitAutomationPrefsKey(scope)
      set((state) => updatePrefs(state, key, (prefs) => ({ ...prefs, feePresetLabel })))
      scheduleUnilateralExitPrefsSdkWrite(scope)
    },

    setMaxFeeRateSatPerVb: (scope, maxFeeRateSatPerVb) => {
      if (!Number.isFinite(maxFeeRateSatPerVb) || maxFeeRateSatPerVb <= 0) return
      const key = unilateralExitAutomationPrefsKey(scope)
      set((state) =>
        updatePrefs(state, key, (prefs) => ({ ...prefs, maxFeeRateSatPerVb })),
      )
      scheduleUnilateralExitPrefsSdkWrite(scope)
    },

    clearScope: (scope) => {
      const key = unilateralExitAutomationPrefsKey(scope)
      set((state) => {
        const prefsByKey = { ...state.prefsByKey }
        delete prefsByKey[key]
        return { prefsByKey }
      })
    },
  }),
)
