import { create } from 'zustand'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import {
  arkadeVtxoOutpointsEqual,
  includesArkadeVtxoOutpoint,
} from '@/workers/arkade-api'

interface UnilateralExitControlState {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStarted: boolean
  /** Bumped on each control-page visit to force React Flow remount. */
  graphRenderEpoch: number

  toggleLeafOutpoint: (outpoint: ArkadeVtxoOutpoint) => void
  setSelectedLeafOutpoints: (outpoints: ArkadeVtxoOutpoint[]) => void
  setJobStarted: (started: boolean) => void
  bumpGraphRenderEpoch: () => void
  reset: () => void
}

const initialState = {
  selectedLeafOutpoints: [] as ArkadeVtxoOutpoint[],
  jobStarted: false,
  graphRenderEpoch: 0,
}

export const useUnilateralExitControlStore = create<UnilateralExitControlState>((set, get) => ({
  ...initialState,

  toggleLeafOutpoint: (outpoint) => {
    const current = get().selectedLeafOutpoints
    if (includesArkadeVtxoOutpoint(current, outpoint)) {
      set({
        selectedLeafOutpoints: current.filter(
          (item) => !arkadeVtxoOutpointsEqual(item, outpoint),
        ),
      })
      return
    }
    set({ selectedLeafOutpoints: [...current, outpoint] })
  },

  setSelectedLeafOutpoints: (outpoints) => set({ selectedLeafOutpoints: outpoints }),

  setJobStarted: (started) => set({ jobStarted: started }),

  bumpGraphRenderEpoch: () =>
    set((state) => ({ graphRenderEpoch: state.graphRenderEpoch + 1 })),

  reset: () => set({ ...initialState }),
}))
