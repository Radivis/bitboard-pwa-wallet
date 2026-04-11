import { nextLabEntityId } from '@/lib/lab-entity-keys'
import { feeSatsFromTxDetails } from '@/lib/lab-tx-fee'
import { type LabOwner, labEntityLabOwner, walletLabOwner } from '@/lib/lab-owner'
import { isCoinbase } from '@/lib/lab-operations'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  type LabBlock,
  type LabBlockDetails,
  type LabBlockTransactionSummary,
  type LabCurrentBlockTemplateParams,
  type LabTxDetails,
} from './lab-api'
import { parseBlockEffects } from './lab-block-effects'
import { parseBlockHeader } from './lab-block-header'
import { getWasm } from './lab-wasm-loader'
import {
  lookupOwnerForLabAddress,
  parseWasmObject,
  state,
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
    const fa = feeSatPerVbyte(a)
    const fb = feeSatPerVbyte(b)
    if (fb !== fa) return fb - fa
    return a.txid.localeCompare(b.txid)
  })
  const spentBySelected = new Set<string>()
  const selectedEntries: import('./lab-api').MempoolEntry[] = []
  let remainingWeight = Math.max(0, limit)

  while (true) {
    let added = false
    for (const entry of sortedEntries) {
      if (selectedEntries.some((s) => s.txid === entry.txid)) continue
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
  if (state.blocks.length === 0) return null
  return state.blocks[state.blocks.length - 1]
}

function minedByFromBlockTxs(
  blockTxs: LabTxDetails[],
  addressToOwner: Record<string, LabOwner>,
): LabOwner | null {
  const coinbase = blockTxs.find((tx) => isCoinbase(tx))
  const out0 = coinbase?.outputs[0]
  if (!out0) return null
  const fromStoredDetail = out0.owner ?? null
  if (fromStoredDetail) return fromStoredDetail
  return lookupOwnerForLabAddress(out0.address, addressToOwner) ?? null
}

export function minedByForBlockHeight(height: number): LabOwner | null {
  const op = state.mineOperations?.find((m) => m.height === height)
  if (op != null && op.minedBy != null) {
    return op.minedBy
  }
  const blockTxs = state.txDetails.filter((tx) => tx.blockHeight === height)
  return minedByFromBlockTxs(blockTxs, state.addressToOwner ?? {})
}

export function blockTransactionsForHeight(height: number): LabBlockTransactionSummary[] {
  const txRecordByTxid = new Map(state.transactions.map((tx) => [tx.txid, tx]))
  return state.txDetails
    .filter((tx) => tx.blockHeight === height)
    .map((tx) => {
      const txRecord = txRecordByTxid.get(tx.txid)
      return {
        txid: tx.txid,
        sender: txRecord?.sender ?? null,
        receiver: txRecord?.receiver ?? null,
        feeSats: feeSatsFromTxDetails(tx),
        isCoinbase: tx.isCoinbase,
      }
    })
}

/**
 * Resolves coinbase recipient and template "mined by" label without mutating lab state.
 * Mirrors mineBlocks branching (entity → explicit target → anonymous lab entity).
 */
export async function resolveTemplateCoinbase(
  params: LabCurrentBlockTemplateParams,
  wasmModule: Awaited<ReturnType<typeof getWasm>>,
): Promise<{ address: string; minedBy: LabOwner | null }> {
  const labNetwork = params.labNetwork ?? 'regtest'
  const labAddressType = params.labAddressType ?? 'segwit'

  const targetArg =
    params.ownerType === 'wallet'
      ? (params.walletCurrentAddress ?? '').trim()
      : params.targetAddress.trim()

  const entityNameOpt =
    params.ownerType === 'name' ? (params.ownerName?.trim() ?? '') : ''

  if (
    params.ownerType === 'name' &&
    params.ownerLabEntityId != null &&
    Number.isInteger(params.ownerLabEntityId)
  ) {
    const entity = state.entities.find((e) => e.labEntityId === params.ownerLabEntityId)
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
    const cr = parseWasmObject(createdRaw)
    const first = String(cr.first_address ?? '')
    if (!first) {
      throw new Error('Lab entity wallet creation failed (no first address)')
    }
    return first
  }

  if (entityNameOpt !== '') {
    const entity = state.entities.find((e) => e.entityName === entityNameOpt)
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
      minedBy: labEntityLabOwner(nextLabEntityId(state.entities)),
    }
  }

  if (targetArg !== '') {
    const minedBy =
      params.ownerType === 'wallet' && params.ownerWalletId != null
        ? walletLabOwner(params.ownerWalletId)
        : null
    return { address: targetArg, minedBy }
  }

  return {
    address: firstAddressFromNewEntityWallet(),
    minedBy: labEntityLabOwner(nextLabEntityId(state.entities)),
  }
}

export async function buildMinedBlockDetails(block: LabBlock): Promise<LabBlockDetails> {
  const header = await parseBlockHeader(block.blockData)
  const blockTxDetails = state.txDetails.filter((tx) => tx.blockHeight === block.height)
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

  const blockLimit = state.blockWeightLimit ?? LAB_DEFAULT_BLOCK_WEIGHT_UNITS
  const selectedEntries = selectMempoolTxsForBlock([...(state.mempool ?? [])], blockLimit)
  const mempoolTxHexes = selectedEntries.map((entry) => entry.signedTxHex)
  const totalFeesSats = selectedEntries.reduce((sum, entry) => sum + entry.feeSats, 0)

  const { address: targetAddress, minedBy } = await resolveTemplateCoinbase(params, wasmModule)

  const coinbaseScriptPubkeyHex = wasmModule.lab_address_to_script_pubkey_hex(targetAddress)
  const blockHex = wasmModule.lab_mine_block(
    previousHash,
    previewHeight,
    coinbaseScriptPubkeyHex,
    mempoolTxHexes,
    BigInt(totalFeesSats),
  )
  const header = await parseBlockHeader(blockHex)
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  const previewEffects = parseBlockEffects(rawEffects)
  const entryByTxid = new Map(selectedEntries.map((entry) => [entry.txid, entry]))

  const transactions: LabBlockTransactionSummary[] = previewEffects.transactions.map((tx) => {
    const matchedEntry = entryByTxid.get(tx.txid)
    const isCb = isCoinbase(tx)
    return {
      txid: tx.txid,
      sender: matchedEntry?.sender ?? null,
      receiver: isCb ? minedBy : (matchedEntry?.receiver ?? null),
      feeSats: matchedEntry?.feeSats ?? 0,
      isCoinbase: isCb,
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
