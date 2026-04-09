import type { LabAddress } from './lab-api'
import type { BlockEffectsParsed, BlockEffectsTx } from './lab-block-effects-types'
import { applyTransactionsAndDetailsFromBlock } from './lab-apply-block-transactions'
import { state } from './lab-worker-state'

type WasmModule = Awaited<ReturnType<typeof import('./lab-wasm-loader').getWasm>>

export function parseBlockEffects(raw: unknown): BlockEffectsParsed {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as BlockEffectsParsed
      return {
        spent: Array.isArray(parsed?.spent) ? parsed.spent : [],
        new_utxos: Array.isArray(parsed?.new_utxos) ? parsed.new_utxos : [],
        transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
        block_time: typeof parsed?.block_time === 'number' ? parsed.block_time : 0,
      }
    } catch {
      return { spent: [], new_utxos: [], transactions: [], block_time: 0 }
    }
  }
  const effects = raw as Record<string, unknown>
  const spent = Array.isArray(effects?.spent) ? effects.spent : []
  const new_utxos = Array.isArray(effects?.new_utxos) ? effects.new_utxos : []
  const transactions = Array.isArray(effects?.transactions) ? effects.transactions : []
  const block_time = typeof effects?.block_time === 'number' ? effects.block_time : 0
  return { spent, new_utxos, transactions, block_time }
}

function readSatsFromUtxoRow(row: Record<string, unknown>): number {
  const v = row.amount_sats ?? row.amountSats
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  return 0
}

function removeSpentUtxos(spent: { txid: string; vout: number }[]): void {
  for (const stxo of spent) {
    state.utxos = state.utxos.filter((utxo) => !(utxo.txid === stxo.txid && utxo.vout === stxo.vout))
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
    const row = utxo as unknown as Record<string, unknown>
    const addressStr = String(utxo.address)
    state.utxos.push({
      txid: String(utxo.txid),
      vout: Number(utxo.vout),
      address: addressStr,
      amountSats: readSatsFromUtxoRow(row),
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
  for (const u of newUtxos) {
    const txid = String(u.txid)
    const list = byTxid.get(txid) ?? []
    list.push(u)
    byTxid.set(txid, list)
  }
  const firstTxid = String(newUtxos[0].txid)
  const rows = byTxid.get(firstTxid) ?? []
  return [
    {
      txid: firstTxid,
      inputs: [],
      outputs: rows.map((u) => {
        const row = u as unknown as Record<string, unknown>
        return {
          address: String(u.address),
          amount_sats: readSatsFromUtxoRow(row),
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
    state.addresses.push(newAddress)
  }

  const blockHash = wasmModule.lab_block_hash(blockHex)
  state.blocks.push({
    blockHash,
    height,
    blockData: blockHex,
  })
}
