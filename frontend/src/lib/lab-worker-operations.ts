import { runLabOp } from '@/lib/lab-coordinator'
import {
  getLabWorker,
  initLabWorkerWithState,
  loadLabStateFromDatabase,
  persistLabState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type { LabOwner } from '@/lib/lab-owner'
import type {
  LabBlockDetails,
  LabCurrentBlockTemplateParams,
  LabMineBlocksResult,
  LabMempoolMetadata,
  LabState,
  PrepareRandomLabEntityTransactionResult,
} from '@/workers/lab-api'
import { getCryptoWorker } from '@/workers/crypto-factory'
import {
  labPipelineDebugLog,
  labPipelineSnapshot,
} from '@/lib/lab-pipeline-debug'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab-random-limits'

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
    ownerLabEntityId?: number
    ownerWalletId?: number
    labAddressType?: string
    labNetwork?: string
  },
): Promise<LabMineBlocksResult> {
  return runLabOp(async () => {
    labPipelineDebugLog('mineBlocks:start', {
      count,
      targetLen: targetAddress.length,
      hasOwnerName: Boolean(options?.ownerName),
      hasOwnerLabEntityId: options?.ownerLabEntityId != null,
      hasOwnerWalletId: options?.ownerWalletId != null,
    })
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const result = await labWorker.mineBlocks(count, targetAddress, options)
    labPipelineDebugLog('mineBlocks:workerReturned', {
      blockCount: result.state.blocks.length,
      utxoCount: result.state.utxos.length,
      totalSats: sumUtxoSats(result.state.utxos),
      includedMempoolTxCount: result.includedMempoolTxCount,
      discardedConflictTxCount: result.discardedConflictTxCount,
    })
    await persistLabState(result.state)
    labPipelineDebugLog('mineBlocks:afterPersist', {})
    labPipelineSnapshot('mineBlocks:end', result.state)
    return result
  })
}

function parseLabEntitySignResult(raw: unknown): {
  signedTxHex: string
  feeSats: number
  hasChange: boolean
  changesetJson: string
  changeAddress: string | null
} {
  const o: Record<string, unknown> =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {}
  const changeRaw = o.change_address
  return {
    signedTxHex: String(o.signed_tx_hex ?? ''),
    feeSats: Number(o.fee_sats ?? 0),
    hasChange: Boolean(o.has_change),
    changesetJson: String(o.changeset_json ?? ''),
    changeAddress:
      typeof changeRaw === 'string' && changeRaw.length > 0 ? changeRaw : null,
  }
}

/**
 * Build/sign a lab-entity mempool tx (lab worker + crypto worker), then persist.
 */
export async function labOpCreateLabEntityTransaction(params: {
  labEntityId: number
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
  knownRecipientOwner?: LabOwner | null
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

  if (hasChange && (changeAddress == null || changeAddress === '')) {
    throw new Error('labOpCreateLabEntityTransaction: change_address missing when has_change')
  }

  const totalInput = prep.totalInput
  const outputsDetail = hasChange
    ? [
        ...prep.mempoolMetadata.outputsDetail,
        {
          address: changeAddress as string,
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
    walletChangeAddress: hasChange ? (changeAddress as string) : '',
  }

  if (fullMetadata.receiver == null) {
    throw new Error('labOpCreateLabEntityTransaction: receiver is required before finalize')
  }

  return runLabOp(async () => {
    labPipelineDebugLog('createLabEntityTransaction:finalize', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.finalizeLabEntityMempoolTransaction({
      signedTxHex,
      mempoolMetadata: fullMetadata,
      labEntityId: params.labEntityId,
      newChangesetJson: changesetJson,
    })
    await persistLabState(state)
    labPipelineSnapshot('createLabEntityTransaction:end', state)
    return state
  })
}

/**
 * Create up to `count` random lab-entity transactions, then persist once (in `finally`,
 * including partial progress if the loop throws after some finalizes).
 */
export type LabCreateRandomEntityTransactionsOptions = {
  onProgress?: (createdCount: number, requestedCount: number) => void
}

export async function labOpCreateRandomLabEntityTransactions(
  count: number,
  options?: LabCreateRandomEntityTransactionsOptions,
): Promise<{
  state: LabState
  createdCount: number
}> {
  return runLabOp(async () => {
    labPipelineDebugLog('createRandomLabEntityTransactions:start', { count })
    const requestedCount = Math.max(1, Math.trunc(count))
    if (requestedCount > LAB_MAX_RANDOM_ENTITY_TRANSACTIONS) {
      throw new Error(
        `At most ${LAB_MAX_RANDOM_ENTITY_TRANSACTIONS} random lab transactions per batch (got ${requestedCount})`,
      )
    }

    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const cryptoWorker = getCryptoWorker()

    let createdCount = 0
    let persistedState!: LabState

    try {
      for (let index = 0; index < requestedCount; index += 1) {
        const prepared: PrepareRandomLabEntityTransactionResult | null =
          await labWorker.prepareRandomLabEntityTransaction()
        if (!prepared) break

        const signRaw = await cryptoWorker.labEntityBuildAndSignLabTransaction(prepared.crypto)
        const { signedTxHex, feeSats, hasChange, changesetJson, changeAddress } =
          parseLabEntitySignResult(signRaw)

        if (hasChange && (changeAddress == null || changeAddress === '')) {
          throw new Error(
            'labOpCreateRandomLabEntityTransactions: change_address missing when has_change',
          )
        }

        const outputsDetail = hasChange
          ? [
              ...prepared.mempoolMetadata.outputsDetail,
              {
                address: changeAddress as string,
                amountSats: prepared.totalInput - prepared.prepareParams.amountSats - feeSats,
                isChange: true as const,
                owner: prepared.mempoolMetadata.sender,
              },
            ]
          : [
              {
                ...prepared.mempoolMetadata.outputsDetail[0],
                amountSats: prepared.totalInput - feeSats,
              },
            ]

        const randomFullMetadata = {
          ...prepared.mempoolMetadata,
          feeSats,
          hasChange,
          outputsDetail,
          walletChangeAddress: hasChange ? (changeAddress as string) : '',
        }
        if (randomFullMetadata.receiver == null) {
          throw new Error('labOpCreateRandomLabEntityTransactions: receiver is required before finalize')
        }

        await labWorker.finalizeLabEntityMempoolTransaction({
          signedTxHex,
          mempoolMetadata: randomFullMetadata,
          labEntityId: prepared.labEntityId,
          newChangesetJson: changesetJson,
        })
        createdCount += 1
        options?.onProgress?.(createdCount, requestedCount)
      }
    } finally {
      const snapshot = await labWorker.getStateSnapshot()
      await persistLabState(snapshot)
      persistedState = snapshot
      labPipelineSnapshot('createRandomLabEntityTransactions:afterPersist', snapshot)
    }

    labPipelineDebugLog('createRandomLabEntityTransactions:done', { createdCount })
    return { state: persistedState, createdCount }
  })
}

export async function labOpAddSignedTransaction(
  signedTxHex: string,
  mempoolMetadata: LabMempoolMetadata,
): Promise<LabState> {
  if (mempoolMetadata.receiver == null) {
    throw new Error('labOpAddSignedTransaction: receiver is required')
  }
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

export async function labOpCreateLabEntity(options?: {
  ownerName?: string
  labAddressType?: string
  labNetwork?: string
}): Promise<LabState> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.createLabEntity(options)
    await persistLabState(state)
    return state
  })
}

export async function labOpRenameLabEntity(labEntityId: number, newName: string): Promise<LabState> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.renameLabEntity(labEntityId, newName)
    await persistLabState(state)
    return state
  })
}

export async function labOpDeleteLabEntity(labEntityId: number): Promise<LabState> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.deleteLabEntity(labEntityId)
    await persistLabState(state)
    return state
  })
}

export async function labOpSetLabEntityDead(labEntityId: number, dead: boolean): Promise<LabState> {
  return runLabOp(async () => {
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.setLabEntityDead(labEntityId, dead)
    await persistLabState(state)
    return state
  })
}
