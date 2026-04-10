/**
 * Bitcoin coinbase conventions and helpers for lab block-effect txs.
 */

/** 32-byte zero txid (hex) for coinbase prevout. */
export const LAB_COINBASE_PREV_TXID_HEX = `${'00'.repeat(32)}`

/** Bitcoin coinbase prevout index (all bits set). */
export const LAB_COINBASE_PREV_VOUT = 0xffffffff

/** Typical coinbase input sequence (all bits set). */
export const LAB_COINBASE_SEQUENCE = 0xffffffff

export function isLabCoinbasePrevout(prevTxid: string, prevVout: number): boolean {
  const normalized = prevTxid.toLowerCase().replace(/^0x/, '')
  const zero =
    normalized === LAB_COINBASE_PREV_TXID_HEX ||
    normalized === '' ||
    /^0+$/.test(normalized)
  return zero && prevVout === LAB_COINBASE_PREV_VOUT
}

/** WASM block-effects input shape (snake_case prevouts). */
type BlockEffectsTxInput = { prev_txid: string; prev_vout: number }

/** Persisted lab tx input may use camelCase optional prevouts; spends often omit them. */
type LabCoinbaseInputLike =
  | BlockEffectsTxInput
  | {
      prev_txid?: string
      prev_vout?: number
      prevTxid?: string
      prevVout?: number
    }

function resolvePrevout(input: LabCoinbaseInputLike): { txid: string; vout: number } | null {
  const rec = input as Record<string, string | number | undefined>
  const txid = rec.prev_txid ?? rec.prevTxid
  const vout = rec.prev_vout ?? rec.prevVout
  if (txid === undefined || vout === undefined) return null
  return { txid: String(txid), vout: Number(vout) }
}

/**
 * True when the tx is a lab coinbase: WASM empty inputs (legacy), or exactly one input with
 * Bitcoin coinbase prevout. Accepts block-effects txs (snake_case) and persisted detail inputs
 * (camelCase optional prevouts).
 */
export function isCoinbase(tx: { inputs: ReadonlyArray<LabCoinbaseInputLike> }): boolean {
  const { inputs } = tx
  if (inputs.length === 0) return true
  if (inputs.length > 1) return false
  const prev = resolvePrevout(inputs[0])
  if (prev == null) return false
  return isLabCoinbasePrevout(prev.txid, prev.vout)
}
