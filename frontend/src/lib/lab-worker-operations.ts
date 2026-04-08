import { runLabOp } from '@/lib/lab-coordinator'
import {
  getLabWorker,
  initLabWorkerWithState,
  loadLabStateFromDatabase,
  persistLabState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type {
  LabBlockDetails,
  LabCurrentBlockTemplateParams,
  LabMempoolMetadata,
  LabState,
} from '@/workers/lab-api'
import { getCryptoWorker } from '@/workers/crypto-factory'
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
  options?: {
    ownerName?: string
    ownerWalletId?: number
    labAddressType?: string
    labNetwork?: string
  },
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

function parseLabEntitySignResult(raw: unknown): {
  signedTxHex: string
  feeSats: number
  hasChange: boolean
  changesetJson: string
  changeAddress: string
} {
  const o: Record<string, unknown> =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {}
  return {
    signedTxHex: String(o.signed_tx_hex ?? ''),
    feeSats: Number(o.fee_sats ?? 0),
    hasChange: Boolean(o.has_change),
    changesetJson: String(o.changeset_json ?? ''),
    changeAddress: String(o.change_address ?? ''),
  }
}

/**
 * Build/sign a lab-entity mempool tx (lab worker + crypto worker), then persist.
 */
export async function labOpCreateLabEntityTransaction(params: {
  entityName: string
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
}): Promise<LabState> {
  const prep = await runLabOp(async () => {
    labPipelineDebugLog('createLabEntityTransaction:prepare', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    return labWorker.prepareLabEntityTransaction(params)
  })

  const cryptoWorker = getCryptoWorker()
  const c = prep.crypto
  const signRaw = await cryptoWorker.labEntityBuildAndSignLabTransaction({
    mnemonic: c.mnemonic,
    changesetJson: c.changesetJson,
    network: c.network,
    addressType: c.addressType,
    accountId: c.accountId,
    utxosJson: c.utxosJson,
    toAddress: c.toAddress,
    amountSats: c.amountSats,
    feeRateSatPerVb: c.feeRateSatPerVb,
  })
  const { signedTxHex, feeSats, hasChange, changesetJson, changeAddress } =
    parseLabEntitySignResult(signRaw)

  const totalInput = prep.totalInput
  const outputsDetail = hasChange
    ? [
        ...prep.mempoolMetadata.outputsDetail,
        {
          address: changeAddress,
          amountSats: totalInput - params.amountSats - feeSats,
          isChange: true as const,
          owner: prep.mempoolMetadata.sender,
        },
      ]
    : [
        {
          ...prep.mempoolMetadata.outputsDetail[0],
          amountSats: totalInput - feeSats,
        },
      ]

  const fullMetadata = {
    ...prep.mempoolMetadata,
    feeSats,
    hasChange,
    outputsDetail,
    walletChangeAddress: hasChange ? changeAddress : '',
  }

  return runLabOp(async () => {
    labPipelineDebugLog('createLabEntityTransaction:finalize', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.finalizeLabEntityMempoolTransaction({
      signedTxHex,
      mempoolMetadata: fullMetadata,
      entityName: params.entityName,
      newChangesetJson: changesetJson,
    })
    await persistLabState(state)
    labPipelineSnapshot('createLabEntityTransaction:end', state)
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

export async function labOpGetBlockByHeight(height: number): Promise<LabBlockDetails | null> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    return labWorker.getBlockByHeight(height)
  })
}

export async function labOpGetCurrentBlockTemplate(
  params: LabCurrentBlockTemplateParams,
): Promise<LabBlockDetails> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    return labWorker.getCurrentBlockTemplate(params)
  })
}
