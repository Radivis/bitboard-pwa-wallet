import { runLabOp } from '@/lib/lab-coordinator'
import {
  getLabWorker,
  initLabWorkerWithState,
  loadLabStateFromDatabase,
  persistLabState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type { LabState, LabMempoolMetadata } from '@/workers/lab-api'
import {
  labPipelineDebugLog,
  labPipelineSnapshot,
} from '@/lib/lab-pipeline-debug'

function sumUtxoSats(utxos: { amountSats: number }[]): number {
  return utxos.reduce((s, u) => s + (Number(u.amountSats) || 0), 0)
}

export async function labOpLoadChainFromDatabase(): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('labOp:loadFromDb', {})
    const { state } = await initLabWorkerWithState()
    labPipelineDebugLog('labOp:loadFromDb:done', {
      blockCount: state.blocks.length,
      utxoCount: state.utxos.length,
    })
    return state
  })
}

export async function labOpMineBlocks(
  count: number,
  targetAddress: string,
  options?: { ownerName?: string; ownerWalletId?: number },
): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('mineBlocks:start', {
      count,
      targetLen: targetAddress.length,
      hasOwnerName: Boolean(options?.ownerName),
      hasOwnerWalletId: options?.ownerWalletId != null,
    })
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.mineBlocks(count, targetAddress, options)
    labPipelineDebugLog('mineBlocks:workerReturned', {
      blockCount: state.blocks.length,
      utxoCount: state.utxos.length,
      totalSats: sumUtxoSats(state.utxos),
    })
    await persistLabState(state)
    labPipelineDebugLog('mineBlocks:afterPersist', {})
    labPipelineSnapshot('mineBlocks:end', state)
    return state
  })
}

export async function labOpCreateTransaction(
  fromAddress: string,
  toAddress: string,
  amountSats: number,
  feeRateSatPerVb: number,
): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('createLabTransaction:start', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.createTransaction(
      fromAddress,
      toAddress,
      amountSats,
      feeRateSatPerVb,
    )
    await persistLabState(state)
    labPipelineSnapshot('createLabTransaction:end', state)
    return state
  })
}

export async function labOpAddSignedTransaction(
  signedTxHex: string,
  mempoolMetadata: LabMempoolMetadata,
): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('addSignedTransaction:start', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.addSignedTransactionToMempool(
      signedTxHex,
      mempoolMetadata,
    )
    await persistLabState(state)
    labPipelineSnapshot('addSignedTransaction:end', state)
    return state
  })
}

export async function labOpReset(): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('reset:start', {})
    await resetLabFactory()
    const state = await loadLabStateFromDatabase()
    labPipelineSnapshot('reset:end', state)
    return state
  })
}
