import {
  LAB_COINBASE_PREV_TXID_HEX,
  LAB_COINBASE_PREV_VOUT,
} from '@/lib/lab/lab-operations'
import type { LabAddress } from './lab-api'
import type { BlockEffectsParsed, BlockEffectsTx } from './lab-block-effects-types'
import type { WireBlockEffectsParsed } from './lab-block-effects-types'
import {
  emptyBlockEffectsParsed,
  mapBlockEffectsWireToDomain,
} from './lab-block-effects-mappers'
import { applyTransactionsAndDetailsFromBlock } from './lab-apply-block-transactions'
import { labWorkerState } from './lab-worker-state'

type WasmModule = Awaited<ReturnType<typeof import('./lab-wasm-loader').getWasm>>

export function parseBlockEffects(raw: unknown): BlockEffectsParsed {
  if (typeof raw === 'string') {
    try {
      const wire = JSON.parse(raw) as WireBlockEffectsParsed
      return mapBlockEffectsWireToDomain(wire)
    } catch {
      return emptyBlockEffectsParsed()
    }
  }
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return mapBlockEffectsWireToDomain(raw as WireBlockEffectsParsed)
  }
  return emptyBlockEffectsParsed()
}

function removeSpentUtxos(spent: { txid: string; vout: number }[]): void {
  for (const spentOutpoint of spent) {
    labWorkerState.utxos = labWorkerState.utxos.filter(
      (utxo) => !(utxo.txid === spentOutpoint.txid && utxo.vout === spentOutpoint.vout),
    )
  }
}

function addNewUtxos(newUtxos: BlockEffectsParsed['newUtxos']): void {
  for (const utxo of newUtxos) {
    labWorkerState.utxos.push({
      txid: utxo.txid,
      vout: utxo.vout,
      address: utxo.address,
      amountSats: utxo.amountSats,
      scriptPubkeyHex: utxo.scriptPubkeyHex,
    })
  }
}

function synthesizeCoinbaseTxFromNewUtxos(
  newUtxos: BlockEffectsParsed['newUtxos'],
): BlockEffectsTx[] {
  if (!Array.isArray(newUtxos) || newUtxos.length === 0) return []
  const byTxid = new Map<string, BlockEffectsParsed['newUtxos']>()
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
          prevTxid: LAB_COINBASE_PREV_TXID_HEX,
          prevVout: LAB_COINBASE_PREV_VOUT,
        },
      ],
      outputs: coinbaseOutputRows.map((newUtxoRow) => ({
        address: newUtxoRow.address,
        amountSats: newUtxoRow.amountSats,
      })),
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
  const { spent, newUtxos, blockTime = 0 } = effects
  let { transactions } = effects

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
