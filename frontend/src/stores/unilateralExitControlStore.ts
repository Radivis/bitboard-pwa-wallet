import { create } from 'zustand'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import {
  arkadeVtxoOutpointsEqual,
  includesArkadeVtxoOutpoint,
  sortArkadeVtxoOutpoints,
} from '@/workers/arkade-api'

interface UnilateralExitControlState {
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  jobStarted: boolean
  /** Bumped on each control-page visit to force React Flow remount. */
  graphRenderEpoch: number

  toggleLeafTxGroup: (outpoints: ArkadeVtxoOutpoint[]) => void
  seedSelectionFromInProgress: (
    inProgressOutpoints: ArkadeVtxoOutpoint[],
    topologyLeafOutpoints: ArkadeVtxoOutpoint[],
  ) => void
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

  toggleLeafTxGroup: (outpoints) => {
    const group = sortArkadeVtxoOutpoints(outpoints)
    if (group.length === 0) return

    const current = get().selectedLeafOutpoints
    const anySelected = group.some((outpoint) =>
      includesArkadeVtxoOutpoint(current, outpoint),
    )

    if (anySelected) {
      set({
        selectedLeafOutpoints: current.filter(
          (item) => !group.some((groupOutpoint) => arkadeVtxoOutpointsEqual(item, groupOutpoint)),
        ),
      })
      return
    }

    set({
      selectedLeafOutpoints: sortArkadeVtxoOutpoints([...current, ...group]),
    })
  },

  seedSelectionFromInProgress: (inProgressOutpoints, topologyLeafOutpoints) => {
    if (inProgressOutpoints.length === 0) return

    const leafOutpointsByTxid = new Map<string, ArkadeVtxoOutpoint[]>()
    for (const leafOutpoint of topologyLeafOutpoints) {
      const siblings = leafOutpointsByTxid.get(leafOutpoint.txid) ?? []
      siblings.push(leafOutpoint)
      leafOutpointsByTxid.set(leafOutpoint.txid, siblings)
    }
    for (const siblings of leafOutpointsByTxid.values()) {
      siblings.sort((left, right) => left.vout - right.vout)
    }

    const txidsInProgress = new Set(inProgressOutpoints.map((outpoint) => outpoint.txid))
    const selected: ArkadeVtxoOutpoint[] = []
    for (const txid of txidsInProgress) {
      const group = leafOutpointsByTxid.get(txid)
      if (group != null) {
        selected.push(...group)
      }
    }

    set({
      selectedLeafOutpoints:
        selected.length > 0
          ? sortArkadeVtxoOutpoints(selected)
          : sortArkadeVtxoOutpoints(inProgressOutpoints),
      jobStarted: true,
    })
  },

  setJobStarted: (started) => set({ jobStarted: started }),

  bumpGraphRenderEpoch: () =>
    set((state) => ({ graphRenderEpoch: state.graphRenderEpoch + 1 })),

  reset: () => set({ ...initialState }),
}))
