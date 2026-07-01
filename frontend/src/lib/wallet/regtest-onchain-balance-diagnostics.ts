/**
 * Pure helpers for @regtest on-chain send E2E failures.
 * Keep logic here (not in Playwright helpers) so classification/formatting is unit-testable.
 */

export type RegtestEsploraUtxoSnapshot = {
  txid: string
  vout: number
  value: number
  confirmed: boolean
  blockHeight: number | null
}

export type RegtestOnchainBalanceDiagnosticSnapshot = {
  receiveAddress: string
  minRequiredSpendableSats: number
  parsedDashboardSpendableSats: number
  esploraApiUrl: string
  esploraTipHeight: number | null
  esploraUtxos: RegtestEsploraUtxoSnapshot[]
  esploraConfirmedSats: number
  esploraUnconfirmedSats: number
  dashboardCardText: string
  onchainLoadPhase: string | null
  onchainSyncPhase: string | null
  syncButtonText: string
  syncButtonEnabled: boolean
  syncCaptionText: string
  syncErrorBannerText: string | null
  staleEsploraBannerText: string | null
}

export type RegtestOnchainBalanceFailureKind =
  | 'esplora_not_funded'
  | 'onchain_sync_error'
  | 'pending_incoming_only'
  | 'spendable_below_threshold'
  | 'unknown'

export function classifyRegtestOnchainBalanceFailure(
  snapshot: RegtestOnchainBalanceDiagnosticSnapshot,
): RegtestOnchainBalanceFailureKind {
  if (snapshot.syncErrorBannerText != null && snapshot.syncErrorBannerText.trim().length > 0) {
    return 'onchain_sync_error'
  }

  if (snapshot.esploraConfirmedSats < snapshot.minRequiredSpendableSats) {
    return 'esplora_not_funded'
  }

  const cardText = snapshot.dashboardCardText
  const hasPendingBreakdown =
    cardText.includes('Pending incoming') ||
    cardText.includes('Pending change') ||
    cardText.includes('Immature')

  if (
    hasPendingBreakdown &&
    snapshot.parsedDashboardSpendableSats < snapshot.minRequiredSpendableSats
  ) {
    return 'pending_incoming_only'
  }

  if (snapshot.parsedDashboardSpendableSats < snapshot.minRequiredSpendableSats) {
    return 'spendable_below_threshold'
  }

  return 'unknown'
}

export function interpretRegtestOnchainBalanceFailure(
  kind: RegtestOnchainBalanceFailureKind,
): string {
  switch (kind) {
    case 'esplora_not_funded':
      return (
        'Esplora does not show enough confirmed sats at the funded receive address. ' +
        'The faucet/mine step or indexer lag is the first place to investigate — not BDK.'
      )
    case 'onchain_sync_error':
      return (
        'The dashboard on-chain rail reported sync-error after Sync on-chain. ' +
        'Inspect the sync-error banner text below; do not retry with Full rescan in this test — that would mask the failure mode.'
      )
    case 'pending_incoming_only':
      return (
        'Esplora shows confirmed UTXOs at the receive address, but the dashboard spendable balance is still zero ' +
        'with pending breakdown lines. BDK ingested the funding as non-spendable (likely local chain / confirmation trust mismatch). ' +
        'A manual Full rescan might repair this in the app; for this test that is a product bug, not a retry path.'
      )
    case 'spendable_below_threshold':
      return (
        'Esplora is funded and there is no sync-error banner, but parsed spendable sats are still below the threshold. ' +
        'Compare raw dashboard card text with the parser output — wrong address type/network or partial sync are likely.'
      )
    case 'unknown':
      return 'Could not classify automatically; use the raw sections below.'
  }
}

function formatEsploraUtxoLines(utxos: RegtestEsploraUtxoSnapshot[]): string {
  if (utxos.length === 0) {
    return '  (no UTXOs returned)'
  }
  return utxos
    .map(
      (utxo) =>
        `  - txid=${utxo.txid} vout=${utxo.vout} value=${utxo.value} sats confirmed=${utxo.confirmed}` +
        (utxo.blockHeight != null ? ` block_height=${utxo.blockHeight}` : ''),
    )
    .join('\n')
}

export function formatRegtestOnchainBalanceDiagnosticReport(
  snapshot: RegtestOnchainBalanceDiagnosticSnapshot,
): string {
  const kind = classifyRegtestOnchainBalanceFailure(snapshot)
  const interpretation = interpretRegtestOnchainBalanceFailure(kind)

  return [
    '=== Regtest on-chain balance failure diagnostic ===',
    '',
    `Failure kind: ${kind}`,
    `Receive address: ${snapshot.receiveAddress}`,
    `Required spendable sats: ${snapshot.minRequiredSpendableSats}`,
    `Parsed dashboard spendable sats: ${snapshot.parsedDashboardSpendableSats}`,
    '',
    '--- Esplora ---',
    `API: ${snapshot.esploraApiUrl}`,
    `Tip height: ${snapshot.esploraTipHeight ?? '(unavailable)'}`,
    `Confirmed sats at receive address: ${snapshot.esploraConfirmedSats}`,
    `Unconfirmed sats at receive address: ${snapshot.esploraUnconfirmedSats}`,
    'UTXOs:',
    formatEsploraUtxoLines(snapshot.esploraUtxos),
    '',
    '--- Dashboard on-chain rail ---',
    `data-rail-onchain-load: ${snapshot.onchainLoadPhase ?? '(missing)'}`,
    `data-rail-onchain-sync: ${snapshot.onchainSyncPhase ?? '(missing)'}`,
    `Sync button: "${snapshot.syncButtonText}" (enabled=${snapshot.syncButtonEnabled})`,
    `Sync caption: ${snapshot.syncCaptionText || '(empty)'}`,
    snapshot.syncErrorBannerText
      ? `Sync-error banner:\n${snapshot.syncErrorBannerText}`
      : 'Sync-error banner: (none visible)',
    snapshot.staleEsploraBannerText
      ? `Stale Esplora banner:\n${snapshot.staleEsploraBannerText}`
      : 'Stale Esplora banner: (none visible)',
    '',
    '--- Dashboard balance card (raw) ---',
    snapshot.dashboardCardText.trim() || '(empty)',
    '',
    '--- Interpretation ---',
    interpretation,
  ].join('\n')
}
