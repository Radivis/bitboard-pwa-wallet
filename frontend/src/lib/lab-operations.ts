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

/** True when WASM reports no inputs (legacy) or standard coinbase prevout. */
export function isCoinbaseFromBlockEffectsTx(tx: {
  inputs: { prev_txid: string; prev_vout: number }[]
}): boolean {
  if (tx.inputs.length === 0) return true
  if (tx.inputs.length === 1) {
    const i = tx.inputs[0]
    return isLabCoinbasePrevout(i.prev_txid, i.prev_vout)
  }
  return false
}
