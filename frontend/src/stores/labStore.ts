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
import {
  labPipelineDebugLog,
  labPipelineSnapshot,
} from '@/lib/lab-pipeline-debug'

/**
 * Single-flight queue for hydrate / mine / reset / mempool ops.
 * Without it, hydrate() can run while persistLabState() is between DELETE and INSERT;
 * loadLabStateFromDatabase() then sees an empty lab DB. A late hydrate set() can also
 * run after mineBlocks apply() and wipe Zustand — mined balance shows 0 instead of 50 BTC.
 */
let labMutationChain: Promise<unknown> = Promise.resolve()

function enqueueLabMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = labMutationChain.then(task, task)
  labMutationChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
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

function sumUtxoSats(utxos: { amountSats: number }[]): number {
  return utxos.reduce((s, u) => s + (Number(u.amountSats) || 0), 0)
}

export const useLabStore = create<LabStore>((set, get) => {
  const apply = applyState(set)

  return {
    ...EMPTY_LAB_STATE,
    isHydrated: false,

    mineBlocks: async (count, targetAddress, options) =>
      enqueueLabMutation(async () => {
        labPipelineDebugLog('mineBlocks:start', {
          count,
          targetLen: targetAddress.length,
          hasOwnerName: Boolean(options?.ownerName),
          hasOwnerWalletId: options?.ownerWalletId != null,
        })
        labPipelineSnapshot('mineBlocks:storeBefore', get())
        const labWorker = getLabWorker()
        const state = await labWorker.mineBlocks(count, targetAddress, options)
        labPipelineDebugLog('mineBlocks:workerReturned', {
          blockCount: state.blocks.length,
          utxoCount: state.utxos.length,
          totalSats: sumUtxoSats(state.utxos),
        })
        await persistLabState(state)
        labPipelineDebugLog('mineBlocks:afterPersist', {})
        apply(state)
        labPipelineSnapshot('mineBlocks:afterApply', get())
        return state
      }),

    createLabTransaction: async (
      fromAddress,
      toAddress,
      amountSats,
      feeRateSatPerVb,
    ) =>
      enqueueLabMutation(async () => {
        labPipelineDebugLog('createLabTransaction:start', {})
        const labWorker = getLabWorker()
        const state = await labWorker.createTransaction(
          fromAddress,
          toAddress,
          amountSats,
          feeRateSatPerVb,
        )
        await persistLabState(state)
        apply(state)
        labPipelineSnapshot('createLabTransaction:afterApply', get())
        return state
      }),

    addSignedTransaction: async (signedTxHex, mempoolMetadata) =>
      enqueueLabMutation(async () => {
        labPipelineDebugLog('addSignedTransaction:start', {})
        const labWorker = getLabWorker()
        const state = await labWorker.addSignedTransactionToMempool(
          signedTxHex,
          mempoolMetadata,
        )
        await persistLabState(state)
        apply(state)
        labPipelineSnapshot('addSignedTransaction:afterApply', get())
        return state
      }),

    hydrate: async () =>
      enqueueLabMutation(async () => {
        labPipelineDebugLog('hydrate:start', {})
        labPipelineSnapshot('hydrate:storeBefore', get())
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
        labPipelineDebugLog('hydrate:loadedFromDb', {
          blockCount: state.blocks.length,
          utxoCount: state.utxos.length,
          totalSats: sumUtxoSats(state.utxos),
        })
        labPipelineSnapshot('hydrate:end', get())
      }),

    reset: async () =>
      enqueueLabMutation(async () => {
        labPipelineDebugLog('reset:start', {})
        await resetLabFactory()
        set({
          ...EMPTY_LAB_STATE,
          isHydrated: true,
        })
        labPipelineSnapshot('reset:end', get())
      }),
  }
})
