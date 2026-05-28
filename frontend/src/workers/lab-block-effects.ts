import {
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
} from '@/lib/lab/lab-operations'
import type { LabAddress } from './lab-api'
import type { BlockEffectsParsed, BlockEffectsTx } from './lab-block-effects-types'
import { applyTransactionsAndDetailsFromBlock } from './lab-apply-block-transactions'
import { labWorkerState } from './lab-worker-state'

type WasmModule = Awaited<ReturnType<typeof import('./lab-wasm-loader').getWasm>>

export function parseBlockEffects(raw: unknown): BlockEffectsParsed {
  if (typeof raw === 'string') {
    try {
      const parsedBlockEffectsJson = JSON.parse(raw) as BlockEffectsParsed
      return {
        spent: Array.isArray(parsedBlockEffectsJson?.spent)
          ? parsedBlockEffectsJson.spent
          : [],
        new_utxos: Array.isArray(parsedBlockEffectsJson?.new_utxos)
          ? parsedBlockEffectsJson.new_utxos
          : [],
        transactions: Array.isArray(parsedBlockEffectsJson?.transactions)
          ? parsedBlockEffectsJson.transactions
          : [],
        block_time:
          typeof parsedBlockEffectsJson?.block_time === 'number'
            ? parsedBlockEffectsJson.block_time
            : 0,
      }
    } catch {
      return { spent: [], new_utxos: [], transactions: [], block_time: 0 }
    }
  }
  const blockEffectsRecord = raw as Record<string, unknown>
  const spent = Array.isArray(blockEffectsRecord?.spent) ? blockEffectsRecord.spent : []
  const new_utxos = Array.isArray(blockEffectsRecord?.new_utxos)
    ? blockEffectsRecord.new_utxos
    : []
  const transactions = Array.isArray(blockEffectsRecord?.transactions)
    ? blockEffectsRecord.transactions
    : []
  const block_time =
    typeof blockEffectsRecord?.block_time === 'number' ? blockEffectsRecord.block_time : 0
  return { spent, new_utxos, transactions, block_time }
}

function readSatsFromUtxoFields(utxoFields: Record<string, unknown>): number {
  const amountSatsRaw = utxoFields.amount_sats ?? utxoFields.amountSats
  if (typeof amountSatsRaw === 'bigint') return Number(amountSatsRaw)
  if (typeof amountSatsRaw === 'number' && Number.isFinite(amountSatsRaw)) {
    return Math.trunc(amountSatsRaw)
  }
  return 0
}

function removeSpentUtxos(spent: { txid: string; vout: number }[]): void {
  for (const spentOutpoint of spent) {
    labWorkerState.utxos = labWorkerState.utxos.filter(
      (utxo) => !(utxo.txid === spentOutpoint.txid && utxo.vout === spentOutpoint.vout),
    )
  }
}

function addNewUtxos(
  newUtxos: {
    txid: string
    vout: number
    address: string
    amount_sats?: number
    script_pubkey_hex?: string
    amountSats?: number
    scriptPubkeyHex?: string
  }[],
): void {
  for (const utxo of newUtxos) {
    const utxoFields = utxo as unknown as Record<string, unknown>
    const addressStr = String(utxo.address)
    labWorkerState.utxos.push({
      txid: String(utxo.txid),
      vout: Number(utxo.vout),
      address: addressStr,
      amountSats: readSatsFromUtxoFields(utxoFields),
      scriptPubkeyHex: String(
        utxo.script_pubkey_hex ?? utxo.scriptPubkeyHex ?? '',
      ),
    })
  }
}

function synthesizeCoinbaseTxFromNewUtxos(
  newUtxos: BlockEffectsParsed['new_utxos'],
): BlockEffectsTx[] {
  if (!Array.isArray(newUtxos) || newUtxos.length === 0) return []
  const byTxid = new Map<string, BlockEffectsParsed['new_utxos']>()
  for (const newUtxoRow of newUtxos) {
    const txid = String(newUtxoRow.txid)
    const utxosForTxid = byTxid.get(txid) ?? []
    utxosForTxid.push(newUtxoRow)
    byTxid.set(txid, utxosForTxid)
  }
  const firstTxid = String(newUtxos[0].txid)
  const coinbaseOutputRows = byTxid.get(firstTxid) ?? []
  return [
    {
      txid: firstTxid,
      inputs: [
        {
          prev_txid: LAB_COINBASE_PREV_TXID_HEX,
          prev_vout: LAB_COINBASE_PREV_VOUT,
        },
      ],
      outputs: coinbaseOutputRows.map((newUtxoRow) => {
        const utxoFields = newUtxoRow as unknown as Record<string, unknown>
        return {
          address: String(newUtxoRow.address),
          amount_sats: readSatsFromUtxoFields(utxoFields),
        }
      }),
    },
  ]
}

export function applyBlockEffects(
  wasmModule: WasmModule,
  blockHex: string,
  height: number,
  newAddress?: LabAddress,
): void {
  const rawEffects = wasmModule.lab_block_effects(blockHex)
  const effects = parseBlockEffects(rawEffects)
  const { spent, new_utxos: newUtxos, block_time } = effects
  let { transactions } = effects
  const blockTime = block_time ?? 0

  if (transactions.length === 0 && newUtxos.length > 0) {
    transactions = synthesizeCoinbaseTxFromNewUtxos(newUtxos)
  }

  applyTransactionsAndDetailsFromBlock(transactions, height, blockTime)
  removeSpentUtxos(spent)
  addNewUtxos(newUtxos)
  if (newAddress) {
    labWorkerState.addresses.push(newAddress)
  }

  const blockHash = wasmModule.lab_block_hash(blockHex)
  labWorkerState.blocks.push({
    blockHash,
    height,
    blockData: blockHex,
  })
}
