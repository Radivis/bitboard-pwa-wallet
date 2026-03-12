import { create } from 'zustand'
import {
  initLabWorkerWithState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type {
  LabState,
  LabBlock,
  LabUtxo,
  LabAddress,
  MempoolEntry,
  LabTxRecord,
  LabTxDetails,
} from '@/workers/lab-api'

const EMPTY_LAB_STATE: LabState = {
  blocks: [],
  utxos: [],
  addresses: [],
  addressToOwner: {},
  mempool: [],
  transactions: [],
  txDetails: [],
}

interface LabStoreState extends LabState {
  isHydrated: boolean
}

interface LabStoreActions {
  setState: (state: LabState) => void
  hydrate: () => Promise<void>
  reset: () => Promise<void>
}

type LabStore = LabStoreState & LabStoreActions

export const useLabStore = create<LabStore>((set, get) => ({
  ...EMPTY_LAB_STATE,
  isHydrated: false,

  setState: (state: LabState) =>
    set({
      blocks: state.blocks,
      utxos: state.utxos,
      addresses: state.addresses,
      addressToOwner: state.addressToOwner ?? {},
      mempool: state.mempool ?? [],
      transactions: state.transactions,
      txDetails: state.txDetails ?? [],
    }),

  hydrate: async () => {
    const { proxy, state } = await initLabWorkerWithState()
    set({
      blocks: state.blocks,
      utxos: state.utxos,
      addresses: state.addresses,
      addressToOwner: state.addressToOwner ?? {},
      mempool: state.mempool ?? [],
      transactions: state.transactions,
      txDetails: state.txDetails ?? [],
      isHydrated: true,
    })
  },

  reset: async () => {
    await resetLabFactory()
    set({
      ...EMPTY_LAB_STATE,
      isHydrated: true,
    })
  },
}))
