import { isCoinbase } from '@/lib/lab-operations'
import type { LabTxDetails } from '@/workers/lab-api'

/**
 * “Net moved” sats for one lab transaction: aligns with wallet `sent_sats` semantics in
 * {@link buildLabTransactionHistoryRows} — non-change outputs only for spends; coinbase sums all outputs.
 */
export function netMovedSatsForLabTx(tx: LabTxDetails): number {
  if (tx.isCoinbase || isCoinbase(tx)) {
    return tx.outputs.reduce((sum, o) => sum + o.amountSats, 0)
  }
  return tx.outputs
    .filter((o) => o.isChange !== true)
    .reduce((sum, o) => sum + o.amountSats, 0)
}

/** Sum of {@link netMovedSatsForLabTx} for every transaction in the block. */
export function netMovedSatsForBlock(
  txDetails: readonly LabTxDetails[],
  blockHeight: number,
): number {
  return txDetails
    .filter((tx) => tx.blockHeight === blockHeight)
    .reduce((sum, tx) => sum + netMovedSatsForLabTx(tx), 0)
}
