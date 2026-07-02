/**
 * BDK Esplora sync (via bdk_esplora) only anchors a tx when Esplora returns
 * block_height, block_hash, AND block_time on the tx status. Otherwise the tx
 * is recorded as seen_at and shows up as untrusted pending incoming.
 *
 * @see bdk_esplora::insert_anchor_or_seen_at_from_status
 */

export type EsploraTxStatusSnapshot = {
  txid: string
  confirmed: boolean
  blockHeight: number | null
  blockHash: string | null
  blockTime: number | null
}

export function isEsploraTxStatusReadyForBdkAnchor(
  status: Pick<EsploraTxStatusSnapshot, 'confirmed' | 'blockHeight' | 'blockHash' | 'blockTime'>,
): boolean {
  return (
    status.confirmed &&
    status.blockHeight != null &&
    status.blockHash != null &&
    status.blockHash.length > 0 &&
    status.blockTime != null
  )
}

export function parseEsploraTxStatusFromTxEndpointBody(
  txid: string,
  body: unknown,
): EsploraTxStatusSnapshot {
  const record = body as {
    status?: {
      confirmed?: boolean
      block_height?: number
      block_hash?: string
      block_time?: number
    }
  }
  const status = record.status
  return {
    txid,
    confirmed: status?.confirmed === true,
    blockHeight: status?.block_height ?? null,
    blockHash: status?.block_hash ?? null,
    blockTime: status?.block_time ?? null,
  }
}

export function formatEsploraTxStatusForDiagnostic(status: EsploraTxStatusSnapshot): string {
  return [
    `txid=${status.txid}`,
    `confirmed=${status.confirmed}`,
    `block_height=${status.blockHeight ?? '(missing)'}`,
    `block_hash=${status.blockHash ?? '(missing)'}`,
    `block_time=${status.blockTime ?? '(missing)'}`,
    `bdk_anchor_ready=${isEsploraTxStatusReadyForBdkAnchor(status)}`,
  ].join(' ')
}
