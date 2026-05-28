import { AddressType } from '@/lib/wallet/wallet-domain-types'
import { nextLabEntityId } from '@/lib/lab/lab-entity-keys'
import { LabOwnerType } from '@/lib/lab/lab-owner-type'
import { feeSatsFromTxDetails } from '@/lib/lab/lab-tx-fee'
import {
  netMovedSatsForLabTx,
  netMovedSatsFromMempoolEntry,
} from '@/lib/lab/lab-tx-net-moved'
import { type LabOwner, labEntityLabOwner, walletLabOwner } from '@/lib/lab/lab-owner'
import { isCoinbase } from '@/lib/lab/lab-operations'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
  type LabBlock,
  type LabBlockDetails,
  type LabBlockTransactionSummary,
  type LabCurrentBlockTemplateParams,
  type LabTxDetails,
  type LabTxInputDetail,
} from './lab-api'
import { parseBlockEffects } from './lab-block-effects'
import { parseBlockHeader } from './lab-block-header'
import { getWasm } from './lab-wasm-loader'
import {
  lookupOwnerForLabAddress,
  parseWasmObject,
  labWorkerState,
} from './lab-worker-state'

export function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function feeSatPerVbyte(entry: import('./lab-api').MempoolEntry): number {
  if (entry.vsize <= 0) return 0
  return entry.feeSats / entry.vsize
}

/**
 * Greedy block template: repeatedly take the best fee/vByte among remaining txs that fits
 * in the remaining weight budget and does not conflict with already selected inputs.
 */
export function selectMempoolTxsForBlock(
  mempool: import('./lab-api').MempoolEntry[],
  blockWeightLimit: number,
): import('./lab-api').MempoolEntry[] {
  const limit = Number.isFinite(blockWeightLimit) ? blockWeightLimit : LAB_DEFAULT_BLOCK_WEIGHT_UNITS
  const sortedEntries = [...mempool].sort((a, b) => {
    const feeRateA = feeSatPerVbyte(a)
    const feeRateB = feeSatPerVbyte(b)
    if (feeRateB !== feeRateA) return feeRateB - feeRateA
    return a.txid.localeCompare(b.txid)
  })
  const spentBySelected = new Set<string>()
  const selectedEntries: import('./lab-api').MempoolEntry[] = []
  let remainingWeight = Math.max(0, limit)

  while (true) {
    let added = false
    for (const entry of sortedEntries) {
      if (selectedEntries.some((selectedEntry) => selectedEntry.txid === entry.txid)) continue
      if (entry.weight > remainingWeight) continue
      const overlaps = entry.inputs.some((input) =>
        spentBySelected.has(`${input.txid}:${input.vout}`),
      )
      if (overlaps) continue
      selectedEntries.push(entry)
      for (const input of entry.inputs) spentBySelected.add(`${input.txid}:${input.vout}`)
      remainingWeight -= entry.weight
      added = true
      break
    }
    if (!added) break
  }
  return selectedEntries
}

export function getTip(): LabBlock | null {
  if (labWorkerState.blocks.length === 0) return null
  return labWorkerState.blocks[labWorkerState.blocks.length - 1]
}

function minedByFromBlockTxs(
  blockTxs: LabTxDetails[],
  addressToOwner: Record<string, LabOwner>,
): LabOwner | null {
  const coinbase = blockTxs.find((tx) => isCoinbase(tx))
  const coinbasePayoutOutput = coinbase?.outputs[0]
  if (!coinbasePayoutOutput) return null
  const fromStoredDetail = coinbasePayoutOutput.owner ?? null
  if (fromStoredDetail) return fromStoredDetail
  return lookupOwnerForLabAddress(coinbasePayoutOutput.address, addressToOwner) ?? null
}

export function minedByForBlockHeight(height: number): LabOwner | null {
  const mineOperation = labWorkerState.mineOperations?.find(
    (record) => record.height === height,
  )
  if (mineOperation != null && mineOperation.minedBy != null) {
    return mineOperation.minedBy
  }
  const blockTxs = labWorkerState.txDetails.filter((tx) => tx.blockHeight === height)
  return minedByFromBlockTxs(blockTxs, labWorkerState.addressToOwner ?? {})
}

export function blockTransactionsForHeight(height: number): LabBlockTransactionSummary[] {
  const txRecordByTxid = new Map(labWorkerState.transactions.map((tx) => [tx.txid, tx]))
  return labWorkerState.txDetails
    .filter((tx) => tx.blockHeight === height)
    .map((tx) => {
      const txRecord = txRecordByTxid.get(tx.txid)
      return {
        txid: tx.txid,
        sender: txRecord?.sender ?? null,
        receiver: txRecord?.receiver ?? null,
        amountSats: netMovedSatsForLabTx(tx),
        feeSats: feeSatsFromTxDetails(tx),
        inputs: tx.inputs,
      }
    })
}

/**
 * Resolves coinbase recipient and template "mined by" label without mutating lab labWorkerState.
 * Mirrors mineBlocks branching (entity → explicit target → anonymous lab entity).
 */
export async function resolveTemplateCoinbase(
  params: LabCurrentBlockTemplateParams,
  wasmModule: Awaited<ReturnType<typeof getWasm>>,
): Promise<{ address: string; minedBy: LabOwner | null }> {
  const labNetwork = params.labNetwork ?? 'regtest'
  const labAddressType = params.labAddressType ?? AddressType.SegWit

  const targetArg =
    params.ownerType === LabOwnerType.Wallet
      ? (params.walletCurrentAddress ?? '').trim()
      : params.targetAddress.trim()

  const entityNameOpt =
    params.ownerType === LabOwnerType.LabEntity
      ? (params.ownerName?.trim() ?? '')
      : ''

  if (
    params.ownerType === LabOwnerType.LabEntity &&
    params.ownerLabEntityId != null &&
    Number.isInteger(params.ownerLabEntityId)
  ) {
    const entity = labWorkerState.entities.find(
      (entityRecord) => entityRecord.labEntityId === params.ownerLabEntityId,
    )
    if (!entity) {
      throw new Error(`Unknown lab entity id ${params.ownerLabEntityId}`)
    }
    if (entity.isDead) {
      throw new Error('Cannot mine to a dead lab entity')
    }
    return {
      address: wasmModule.lab_entity_get_current_external_address(
        entity.mnemonic,
        entity.changesetJson,
        entity.network,
        entity.addressType,
        entity.accountId,
      ),
      minedBy: labEntityLabOwner(entity.labEntityId),
    }
  }

  const firstAddressFromNewEntityWallet = (): string => {
    const mnemonic = wasmModule.generate_mnemonic(12)
    const createdRaw = wasmModule.create_lab_entity_wallet(
      mnemonic,
      labNetwork,
      labAddressType,
      0,
    )
    const walletCreationResult = parseWasmObject(createdRaw)
    const first = String(walletCreationResult.first_address ?? '')
    if (!first) {
      throw new Error('Lab entity wallet creation failed (no first address)')
    }
    return first
  }

  if (entityNameOpt !== '') {
    const entity = labWorkerState.entities.find(
      (entityRecord) => entityRecord.entityName === entityNameOpt,
    )
    if (entity) {
      return {
        address: wasmModule.lab_entity_get_current_external_address(
          entity.mnemonic,
          entity.changesetJson,
          entity.network,
          entity.addressType,
          entity.accountId,
        ),
        minedBy: labEntityLabOwner(entity.labEntityId),
      }
    }
    return {
      address: firstAddressFromNewEntityWallet(),
      minedBy: labEntityLabOwner(nextLabEntityId(labWorkerState.entities)),
    }
  }

  if (targetArg !== '') {
    const minedBy =
      params.ownerType === LabOwnerType.Wallet && params.ownerWalletId != null
        ? walletLabOwner(params.ownerWalletId)
        : null
    return { address: targetArg, minedBy }
  }

  return {
    address: firstAddressFromNewEntityWallet(),
    minedBy: labEntityLabOwner(nextLabEntityId(labWorkerState.entities)),
  }
}

export async function buildMinedBlockDetails(block: LabBlock): Promise<LabBlockDetails> {
  const header = await parseBlockHeader(block.blockData)
  const blockTxDetails = labWorkerState.txDetails.filter((tx) => tx.blockHeight === block.height)
  const transactions = blockTransactionsForHeight(block.height)
  const totalFeesSats = transactions.reduce((sum, tx) => sum + tx.feeSats, 0)

  return {
    isTemplate: false,
    header,
    metadata: {
      height: block.height,
      minedOn: blockTxDetails[0]?.blockTime ?? header.timestamp,
      minedBy: minedByForBlockHeight(block.height),
      numberOfTransactions: transactions.length,
      totalFeesSats,
    },
    transactions,
  }
}

export async function buildCurrentBlockTemplate(
  params: LabCurrentBlockTemplateParams,
): Promise<LabBlockDetails> {
  const wasmModule = await getWasm()
  const tip = getTip()
  const previewHeight = tip ? tip.height + 1 : 0
  const previousHash = tip?.blockHash ?? ''

  const blockLimit = labWorkerState.blockWeightLimit ?? LAB_DEFAULT_BLOCK_WEIGHT_UNITS
  const selectedEntries = selectMempoolTxsForBlock([...(labWorkerState.mempool ?? [])], blockLimit)
  const mempoolTxHexes = selectedEntries.map((entry) => entry.signedTxHex)
  const totalFeesSats = selectedEntries.reduce((sum, entry) => sum + entry.feeSats, 0)

  const { address: targetAddress, minedBy } = await resolveTemplateCoinbase(params, wasmModule)

  const coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(targetAddress)
  const minerSubsidySats = labWorkerState.minerSubsidySats ?? LAB_DEFAULT_MINER_SUBSIDY_SATS
  const blockHex = wasmModule.lab_mine_block(
    previousHash,
    previewHeight,
    coinbaseScriptPubkeyHex,
    mempoolTxHexes,
    BigInt(minerSubsidySats),
    BigInt(totalFeesSats),
  )
  const header = await parseBlockHeader(blockHex)
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  const previewEffects = parseBlockEffects(rawEffects)
  const entryByTxid = new Map(selectedEntries.map((entry) => [entry.txid, entry]))
  const previewBlockTime =
    typeof previewEffects.blockTime === 'number' ? previewEffects.blockTime : header.timestamp

  const transactions: LabBlockTransactionSummary[] = previewEffects.transactions.map((tx) => {
    const matchedEntry = entryByTxid.get(tx.txid)
    const isCoinbaseTx = isCoinbase(tx)
    const inputs: LabTxInputDetail[] = tx.inputs.map(
      (inp): LabTxInputDetail => ({
        address: '',
        amountSats: 0,
        prevTxid: inp.prevTxid,
        prevVout: inp.prevVout,
      }),
    )
    const outputs = (tx.outputs ?? []).map((outputDetail) => ({
      address: outputDetail.address,
      amountSats: outputDetail.amountSats,
    }))
    const txDetails: LabTxDetails = {
      txid: tx.txid,
      blockHeight: previewHeight,
      blockTime: previewBlockTime,
      confirmations: 0,
      inputs,
      outputs,
    }
    const amountSats =
      !isCoinbaseTx && outputs.length === 0 && matchedEntry
        ? netMovedSatsFromMempoolEntry(matchedEntry)
        : netMovedSatsForLabTx(txDetails)
    return {
      txid: tx.txid,
      sender: matchedEntry?.sender ?? null,
      receiver: isCoinbaseTx ? minedBy : (matchedEntry?.receiver ?? null),
      amountSats,
      feeSats: matchedEntry?.feeSats ?? 0,
      inputs,
    }
  })

  return {
    isTemplate: true,
    header,
    metadata: {
      height: previewHeight,
      minedOn: header.timestamp,
      minedBy,
      numberOfTransactions: transactions.length,
      totalFeesSats,
    },
    transactions,
  }
}
