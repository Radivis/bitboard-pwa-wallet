import { runLabOp } from '@/lib/lab/lab-coordinator'
import {
  getLabWorker,
  initLabWorkerWithState,
  loadLabStateFromDatabase,
  persistLabState,
  resetLab as resetLabFactory,
} from '@/workers/lab-factory'
import type { LabOwner } from '@/lib/lab/lab-owner'
import type {
  LabBlockDetails,
  LabCurrentBlockTemplateParams,
  LabEntityTransactionCryptoParams,
  LabMineBlocksResult,
  LabMempoolMetadata,
  LabState,
  PrepareRandomLabEntityTransactionResult,
} from '@/workers/lab-api'
import { toast } from 'sonner'
import { getCryptoWorker } from '@/workers/crypto-factory'
import type { DraftLabPsbtTransactionResult } from '@/workers/crypto-api'
import {
  mapWireLabEntitySignResultToDomain,
  parseWasmJsonWire,
} from '@/workers/crypto-wire-mappers'
import type { WireLabEntitySignResult } from '@/workers/crypto-wire-types'
import {
  labPipelineDebugLog,
  labPipelineSnapshot,
} from '@/lib/lab/lab-pipeline-debug'
import type { AddressType } from '@/lib/wallet/wallet-domain-types'
import { LAB_MAX_RANDOM_ENTITY_TRANSACTIONS } from '@/lib/lab/lab-random-limits'
import { onchainDustPrepareWarningLines } from '@/lib/wallet/send/onchain-dust-prepare-messages'

function sumUtxoSats(utxos: { amountSats: number }[]): number {
  return utxos.reduce((totalSats, utxo) => totalSats + (Number(utxo.amountSats) || 0), 0)
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
    labAddressType?: AddressType
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
    const mineBlocksOutcome = await labWorker.mineBlocks(count, targetAddress, options)
    labPipelineDebugLog('mineBlocks:workerReturned', {
      blockCount: mineBlocksOutcome.state.blocks.length,
      utxoCount: mineBlocksOutcome.state.utxos.length,
      totalSats: sumUtxoSats(mineBlocksOutcome.state.utxos),
      includedMempoolTxCount: mineBlocksOutcome.includedMempoolTxCount,
      discardedConflictTxCount: mineBlocksOutcome.discardedConflictTxCount,
    })
    await persistLabState(mineBlocksOutcome.state)
    labPipelineDebugLog('mineBlocks:afterPersist', {})
    labPipelineSnapshot('mineBlocks:end', mineBlocksOutcome.state)
    return mineBlocksOutcome
  })
}

function parseLabEntitySignResult(raw: unknown) {
  return mapWireLabEntitySignResultToDomain(
    parseWasmJsonWire<WireLabEntitySignResult>(raw),
  )
}

/**
 * Draft-only lab-entity PSBT (dust / change-free metadata). Does not persist mempool state.
 */
export async function labOpDraftLabEntityTransaction(params: {
  labEntityId: number
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
  knownRecipientOwner?: LabOwner | null
}): Promise<{
  prep: {
    crypto: LabEntityTransactionCryptoParams
    mempoolMetadata: LabMempoolMetadata
    totalInput: number
  }
  draft: DraftLabPsbtTransactionResult
}> {
  const prep = await runLabOp(async () => {
    labPipelineDebugLog('draftLabEntityTransaction:prepare', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    return labWorker.prepareLabEntityTransaction(params)
  })

  const cryptoWorker = getCryptoWorker()
  const cryptoParams = prep.crypto
  const draft = await cryptoWorker.labEntityDraftPsbtTransaction({
    mnemonic: cryptoParams.mnemonic,
    changesetJson: cryptoParams.changesetJson,
    network: cryptoParams.network,
    addressType: cryptoParams.addressType,
    accountId: cryptoParams.accountId,
    utxosJson: cryptoParams.utxosJson,
    toAddress: cryptoParams.toAddress,
    amountSats: cryptoParams.amountSats,
    feeRateSatPerVb: cryptoParams.feeRateSatPerVb,
  })

  return { prep, draft }
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
  applyChangeFreeBump?: boolean
}): Promise<LabState> {
  const prep = await runLabOp(async () => {
    labPipelineDebugLog('createLabEntityTransaction:prepare', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    return labWorker.prepareLabEntityTransaction(params)
  })

  const cryptoWorker = getCryptoWorker()
  const cryptoParams = prep.crypto
  const signRaw = await cryptoWorker.labEntityBuildAndSignTransaction({
    mnemonic: cryptoParams.mnemonic,
    changesetJson: cryptoParams.changesetJson,
    network: cryptoParams.network,
    addressType: cryptoParams.addressType,
    accountId: cryptoParams.accountId,
    utxosJson: cryptoParams.utxosJson,
    toAddress: cryptoParams.toAddress,
    amountSats: cryptoParams.amountSats,
    feeRateSatPerVb: cryptoParams.feeRateSatPerVb,
    applyChangeFreeBump: params.applyChangeFreeBump ?? false,
  })
  const labEntitySignResult = parseLabEntitySignResult(signRaw)
  const {
    signedTxHex,
    feeSats,
    hasChange,
    changesetJson,
    changeAddress,
    finalAmountSats,
    isRaisedToMinDust,
    bumpedChangeFree,
  } = labEntitySignResult

  if (isRaisedToMinDust || bumpedChangeFree) {
    toast.warning(
      onchainDustPrepareWarningLines({ isRaisedToMinDust, bumpedChangeFree }).join(
        ' ',
      ),
    )
  }

  if (hasChange && (changeAddress == null || changeAddress === '')) {
    throw new Error('labOpCreateLabEntityTransaction: change_address missing when has_change')
  }

  const totalInput = prep.totalInput
  const recipientLineAmount =
    finalAmountSats > 0 ? finalAmountSats : params.amountSats

  const outputsDetail = hasChange
    ? [
        {
          ...prep.mempoolMetadata.outputsDetail[0],
          amountSats: recipientLineAmount,
        },
        {
          address: changeAddress as string,
          amountSats: totalInput - recipientLineAmount - feeSats,
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

  const labMempoolTransactionMetadata = {
    ...prep.mempoolMetadata,
    feeSats,
    hasChange,
    outputsDetail,
    walletChangeAddress: hasChange ? (changeAddress as string) : '',
  }

  if (labMempoolTransactionMetadata.receiver == null) {
    throw new Error('labOpCreateLabEntityTransaction: receiver is required before finalize')
  }

  return runLabOp(async () => {
    labPipelineDebugLog('createLabEntityTransaction:finalize', {})
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.finalizeLabEntityMempoolTransaction({
      signedTxHex,
      mempoolMetadata: labMempoolTransactionMetadata,
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

        const signRaw = await cryptoWorker.labEntityBuildAndSignTransaction({
          ...prepared.crypto,
          applyChangeFreeBump: false,
        })
        const parsedRandom = parseLabEntitySignResult(signRaw)
        const {
          signedTxHex,
          feeSats,
          hasChange,
          changesetJson,
          changeAddress,
          finalAmountSats,
        } = parsedRandom

        if (hasChange && (changeAddress == null || changeAddress === '')) {
          throw new Error(
            'labOpCreateRandomLabEntityTransactions: change_address missing when has_change',
          )
        }

        const recipientLineAmount =
          finalAmountSats > 0 ? finalAmountSats : prepared.prepareParams.amountSats

        const outputsDetail = hasChange
          ? [
              {
                ...prepared.mempoolMetadata.outputsDetail[0],
                amountSats: recipientLineAmount,
              },
              {
                address: changeAddress as string,
                amountSats: prepared.totalInput - recipientLineAmount - feeSats,
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
  labAddressType?: AddressType
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

export async function labOpSetBlockWeightLimit(blockWeightLimit: number): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('setBlockWeightLimit:start', { blockWeightLimit })
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.setBlockWeightLimit(blockWeightLimit)
    await persistLabState(state)
    labPipelineSnapshot('setBlockWeightLimit:end', state)
    return state
  })
}

export async function labOpSetMinerSubsidySats(minerSubsidySats: number): Promise<LabState> {
  return runLabOp(async () => {
    labPipelineDebugLog('setMinerSubsidySats:start', { minerSubsidySats })
    await initLabWorkerWithState()
    const labWorker = getLabWorker()
    const state = await labWorker.setMinerSubsidySats(minerSubsidySats)
    await persistLabState(state)
    labPipelineSnapshot('setMinerSubsidySats:end', state)
    return state
  })
}
