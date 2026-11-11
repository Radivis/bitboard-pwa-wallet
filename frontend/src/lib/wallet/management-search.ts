/**
 * Search params for `/wallet/management` (`validateSearch` on that route).
 * Anything that does not match is dropped, so a pasted or stale URL cannot
 * open the delete dialog or show a notice for an arbitrary string.
 *
 * `openDelete` comes from the wallet list: choosing delete there switches to
 * this wallet and lands here so the delete confirmation can open.
 *
 * `completedExitTxid` comes from a successful Arkade unilateral-exit complete.
 * Management keeps the sweep txid on screen until the notice is dismissed.
 */
const SWEEP_TXID_PATTERN = /^[0-9a-fA-F]{64}$/

export interface ManagementSearch {
  openDelete?: boolean
  /** Lowercase 64-character transaction id of a completed unilateral-exit sweep. */
  completedExitTxid?: string
}

export function parseManagementSearch(search: Record<string, unknown>): ManagementSearch {
  const parsed: ManagementSearch = {}
  const openDeleteFromSearch = search.openDelete
  // The router may hand the query value back as a boolean, a number, or a string.
  if (
    openDeleteFromSearch === true ||
    openDeleteFromSearch === 'true' ||
    openDeleteFromSearch === 1 ||
    openDeleteFromSearch === '1'
  ) {
    parsed.openDelete = true
  }
  if (
    typeof search.completedExitTxid === 'string' &&
    SWEEP_TXID_PATTERN.test(search.completedExitTxid)
  ) {
    parsed.completedExitTxid = search.completedExitTxid.toLowerCase()
  }
  return parsed
}
