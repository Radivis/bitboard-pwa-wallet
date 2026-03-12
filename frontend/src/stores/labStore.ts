import { create } from 'zustand'
import {
  initLabWorkerWithState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type { LabState, LabAddress } from '@/workers/lab-api'

function mergeAddressesWithUtxos(
  addresses: LabAddress[],
  utxos: LabState['utxos'],
): LabAddress[] {
  const controlled = new Map(addresses.map((a) => [a.address, a]))
  const fromUtxos = new Set(utxos.map((u) => u.address))
  const result: LabAddress[] = [...addresses]
  for (const addr of fromUtxos) {
    if (!controlled.has(addr)) {
      result.push({ address: addr, wif: '' })
    }
  }
  return result
}

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

export const useLabStore = create<LabStore>((set) => ({
  ...EMPTY_LAB_STATE,
  isHydrated: false,

  setState: (state: LabState) =>
    set({
      blocks: state.blocks,
      utxos: state.utxos,
      addresses: mergeAddressesWithUtxos(state.addresses, state.utxos),
      addressToOwner: state.addressToOwner ?? {},
      mempool: state.mempool ?? [],
      transactions: state.transactions,
      txDetails: state.txDetails ?? [],
    }),

  hydrate: async () => {
    const { state } = await initLabWorkerWithState()
    set({
      blocks: state.blocks,
      utxos: state.utxos,
      addresses: mergeAddressesWithUtxos(state.addresses, state.utxos),
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
