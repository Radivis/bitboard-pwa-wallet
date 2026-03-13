import { create } from 'zustand'
import {
  initLabWorkerWithState,
  resetLab as resetLabFactory,
  getLabWorker,
  persistLabState,
} from '@/workers/lab-factory'
import type {
  LabState,
  LabAddress,
  LabMempoolMetadata,
} from '@/workers/lab-api'

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

function applyState(set: (partial: Partial<LabStoreState>) => void) {
  return (state: LabState) =>
    set({
      blocks: state.blocks,
      utxos: state.utxos,
      addresses: mergeAddressesWithUtxos(state.addresses, state.utxos),
      addressToOwner: state.addressToOwner ?? {},
      mempool: state.mempool ?? [],
      transactions: state.transactions,
      txDetails: state.txDetails ?? [],
    })
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
  mineBlocks: (
    count: number,
    targetAddress: string,
    options?: { ownerName?: string; ownerWalletId?: number },
  ) => Promise<LabState>
  createLabTransaction: (
    fromAddress: string,
    toAddress: string,
    amountSats: number,
    feeRateSatPerVb: number,
  ) => Promise<LabState>
  addSignedTransaction: (
    signedTxHex: string,
    mempoolMetadata: LabMempoolMetadata,
  ) => Promise<LabState>
  hydrate: () => Promise<void>
  reset: () => Promise<void>
}

type LabStore = LabStoreState & LabStoreActions

export const useLabStore = create<LabStore>((set) => {
  const apply = applyState(set)

  return {
    ...EMPTY_LAB_STATE,
    isHydrated: false,

    mineBlocks: async (count, targetAddress, options) => {
      const worker = getLabWorker()
      const state = await worker.mineBlocks(count, targetAddress, options)
      await persistLabState(state)
      apply(state)
      return state
    },

    createLabTransaction: async (
      fromAddress,
      toAddress,
      amountSats,
      feeRateSatPerVb,
    ) => {
      const worker = getLabWorker()
      const state = await worker.createTransaction(
        fromAddress,
        toAddress,
        amountSats,
        feeRateSatPerVb,
      )
      await persistLabState(state)
      apply(state)
      return state
    },

    addSignedTransaction: async (signedTxHex, mempoolMetadata) => {
      const worker = getLabWorker()
      const state = await worker.addSignedTransactionToMempool(
        signedTxHex,
        mempoolMetadata,
      )
      await persistLabState(state)
      apply(state)
      return state
    },

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
  }
})
