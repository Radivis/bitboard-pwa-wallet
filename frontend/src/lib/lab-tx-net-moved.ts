import { isCoinbase } from '@/lib/lab-operations'
import type { LabTxDetails, MempoolEntry } from '@/workers/lab-api'

/**
 * “Net moved” sats for one lab transaction: aligns with wallet `sent_sats` semantics in
 * {@link buildLabTransactionHistoryRows} — non-change outputs only for spends; coinbase sums all outputs.
 */
export function netMovedSatsForLabTx(tx: LabTxDetails): number {
  if (isCoinbase(tx)) {
    return tx.outputs.reduce((sum, o) => sum + o.amountSats, 0)
  }
  return tx.outputs
    .filter((o) => o.isChange !== true)
    .reduce((sum, o) => sum + o.amountSats, 0)
}

/** Mempool unconfirmed transfer amount: sum of non-change outputs (same filter as non-coinbase net moved). */
export function netMovedSatsFromMempoolEntry(entry: MempoolEntry): number {
  return entry.outputsDetail
    .filter((o) => o.isChange !== true)
    .reduce((sum, o) => sum + o.amountSats, 0)
}

/**
 * Sum of {@link netMovedSatsForLabTx} for non-coinbase transactions in the block.
 * Coinbase is excluded so the total reflects mempool transfers only (subsidy size does not dominate).
 */
export function netMovedSatsForBlock(
  txDetails: readonly LabTxDetails[],
  blockHeight: number,
): number {
  return txDetails
    .filter((tx) => tx.blockHeight === blockHeight)
    .filter((tx) => !isCoinbase(tx))
    .reduce((sum, tx) => sum + netMovedSatsForLabTx(tx), 0)
}
