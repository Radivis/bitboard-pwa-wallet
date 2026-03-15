import { create } from 'zustand'
import {
  initLabWorkerWithState,
  resetLab as resetLabFactory,
  getLabWorker,
  persistLabState,
} from '@/workers/lab-factory'
import type { LabState, LabMempoolMetadata } from '@/workers/lab-api'
import { EMPTY_LAB_STATE } from '@/workers/lab-api'
import { mergeAddressesWithUtxos } from '@/lib/lab-utils'

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
      const labWorker = getLabWorker()
      const state = await labWorker.mineBlocks(count, targetAddress, options)
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
      const labWorker = getLabWorker()
      const state = await labWorker.createTransaction(
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
      const labWorker = getLabWorker()
      const state = await labWorker.addSignedTransactionToMempool(
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
