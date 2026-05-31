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

/** Domain prevout fields on block-effects or persisted lab tx inputs. */
type LabCoinbaseInputLike =
  | { prevTxid: string; prevVout: number }
  | {
      prevTxid?: string
      prevVout?: number
      address?: string
      amountSats?: number
    }

function resolvePrevout(input: LabCoinbaseInputLike): { txid: string; vout: number } | null {
  const { prevTxid, prevVout } = input
  if (prevTxid === undefined || prevVout === undefined) return null
  return { txid: String(prevTxid), vout: Number(prevVout) }
}

/**
 * True when the tx is a lab coinbase: exactly one input with Bitcoin coinbase prevout (zero txid,
 * `0xffffffff` vout). Every transaction must have at least one input; WASM encodes coinbase with a
 * synthetic prevout ref.
 */
export function isCoinbase(tx: { inputs: ReadonlyArray<LabCoinbaseInputLike> }): boolean {
  const { inputs } = tx
  if (inputs.length === 0) return false
  if (inputs.length > 1) return false
  const prevout = resolvePrevout(inputs[0])
  if (prevout == null) return false
  return isLabCoinbasePrevout(prevout.txid, prevout.vout)
}
