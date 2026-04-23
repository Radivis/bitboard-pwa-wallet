import { create } from 'zustand'

interface InfomodeState {
  isActive: boolean
  /** Incremented when a click on an explainer zone suppresses the underlying control. */
  lightbulbSuppressionCue: number
  setInfomodeActive: (active: boolean) => void
  toggleInfomode: () => void
  bumpSuppressionVisualCue: () => void
}

export const useInfomodeStore = create<InfomodeState>((set) => ({
  isActive: false,
  lightbulbSuppressionCue: 0,
  setInfomodeActive: (active) => set({ isActive: active }),
  toggleInfomode: () => set((state) => ({ isActive: !state.isActive })),
  bumpSuppressionVisualCue: () =>
    set((s) => ({ lightbulbSuppressionCue: s.lightbulbSuppressionCue + 1 })),
}))
