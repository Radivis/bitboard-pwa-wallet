/**
 * After mining the first block in a lab run, the mempool shrinks by:
 * - txs included in the block (non-coinbase), and
 * - txs removed because an input was spent by an included tx (double-spend losers).
 *
 * This returns how many mempool txs were removed without being included—i.e. discarded
 * due to conflicts with the selected set. Coinbase is never in the mempool.
 */
export function discardedMempoolConflictTxCount(params: {
  mempoolSizeBefore: number
  mempoolSizeAfterFirstBlock: number
  includedMempoolTxCount: number
}): number {
  return Math.max(
    0,
    params.mempoolSizeBefore -
      params.mempoolSizeAfterFirstBlock -
      params.includedMempoolTxCount,
  )
}
