import { isCoinbaseFromBlockEffectsTx } from '@/lib/lab-operations'
import { walletOwnerKey } from '@/lib/lab-utils'
import type {
  LabBlock,
  LabBlockDetails,
  LabBlockTransactionSummary,
  LabCurrentBlockTemplateParams,
  LabTxDetails,
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

export function selectMempoolTxsForBlock(
  mempool: import('./lab-api').MempoolEntry[],
): import('./lab-api').MempoolEntry[] {
  const sortedEntries = [...mempool].sort((a, b) => {
    if (b.feeSats !== a.feeSats) return b.feeSats - a.feeSats
    return a.txid.localeCompare(b.txid)
  })
  const spentBySelected = new Set<string>()
  const selectedEntries: import('./lab-api').MempoolEntry[] = []
  for (const entry of sortedEntries) {
    const overlaps = entry.inputs.some((input) => spentBySelected.has(`${input.txid}:${input.vout}`))
    if (!overlaps) {
      selectedEntries.push(entry)
      for (const input of entry.inputs) spentBySelected.add(`${input.txid}:${input.vout}`)
    }
  }
  return selectedEntries
}

export function getTip(): LabBlock | null {
  if (state.blocks.length === 0) return null
  return state.blocks[state.blocks.length - 1]
}

function feeFromTxDetails(tx: LabTxDetails): number {
  if (tx.isCoinbase) return 0
  const totalInputs = tx.inputs.reduce((sum, input) => sum + input.amountSats, 0)
  const totalOutputs = tx.outputs.reduce((sum, output) => sum + output.amountSats, 0)
  return Math.max(totalInputs - totalOutputs, 0)
}

function minedByFromBlockTxs(
  blockTxs: LabTxDetails[],
  addressToOwner: Record<string, string>,
): string | null {
  const coinbase = blockTxs.find((tx) => tx.isCoinbase || tx.inputs.length === 0)
  const out0 = coinbase?.outputs[0]
  if (!out0) return null
  const fromStoredDetail = out0.owner ?? null
  if (fromStoredDetail) return fromStoredDetail
  return lookupOwnerForLabAddress(out0.address, addressToOwner) ?? null
}

export function minedByForBlockHeight(height: number): string | null {
  const op = state.mineOperations?.find((m) => m.height === height)
  if (op != null && op.minedByKey != null && op.minedByKey !== '') {
    return op.minedByKey
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
        feeSats: feeFromTxDetails(tx),
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
): Promise<{ address: string; minedBy: string | null }> {
  const labNetwork = params.labNetwork ?? 'regtest'
  const labAddressType = params.labAddressType ?? 'segwit'

  const targetArg =
    params.ownerType === 'wallet'
      ? (params.walletCurrentAddress ?? '').trim()
      : params.targetAddress.trim()

  const entityNameOpt =
    params.ownerType === 'name' ? (params.ownerName?.trim() ?? '') : ''

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
        minedBy: entityNameOpt,
      }
    }
    return {
      address: firstAddressFromNewEntityWallet(),
      minedBy: entityNameOpt,
    }
  }

  if (targetArg !== '') {
    const minedBy =
      params.ownerType === 'wallet' && params.ownerWalletId != null
        ? walletOwnerKey(params.ownerWalletId)
        : null
    return { address: targetArg, minedBy }
  }

  const anonymousName = `Anonymous-${crypto.randomUUID()}`
  return {
    address: firstAddressFromNewEntityWallet(),
    minedBy: anonymousName,
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

  const selectedEntries = selectMempoolTxsForBlock([...(state.mempool ?? [])])
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
    const isCoinbase = isCoinbaseFromBlockEffectsTx(tx)
    return {
      txid: tx.txid,
      sender: matchedEntry?.sender ?? null,
      receiver: isCoinbase ? minedBy : (matchedEntry?.receiver ?? null),
      feeSats: matchedEntry?.feeSats ?? 0,
      isCoinbase,
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
