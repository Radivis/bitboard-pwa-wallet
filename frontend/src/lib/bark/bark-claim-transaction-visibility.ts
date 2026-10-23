export type ClaimTransactionVisibility = 'present' | 'gone' | 'unknown'

/** App Esplora view of a broadcast claim. A network error stays unknown. */
export async function claimTransactionVisibility(
  esploraUrl: string,
  txid: string,
): Promise<ClaimTransactionVisibility> {
  const base = esploraUrl.replace(/\/$/, '')
  try {
    const response = await fetch(`${base}/tx/${txid}`)
    if (response.ok) return 'present'
    if (response.status === 404) return 'gone'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
