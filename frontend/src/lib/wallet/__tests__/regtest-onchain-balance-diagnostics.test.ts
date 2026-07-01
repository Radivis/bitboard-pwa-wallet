import { describe, expect, it } from 'vitest'

import {
  classifyRegtestOnchainBalanceFailure,
  formatRegtestOnchainBalanceDiagnosticReport,
  type RegtestOnchainBalanceDiagnosticSnapshot,
} from '@/lib/wallet/regtest-onchain-balance-diagnostics'

function baseSnapshot(
  overrides: Partial<RegtestOnchainBalanceDiagnosticSnapshot> = {},
): RegtestOnchainBalanceDiagnosticSnapshot {
  return {
    receiveAddress: 'bcrt1qtest',
    minRequiredSpendableSats: 1_000,
    parsedDashboardSpendableSats: 0,
    esploraApiUrl: 'http://localhost:7030/api',
    esploraTipHeight: 120,
    esploraUtxos: [
      {
        txid: 'abc',
        vout: 0,
        value: 100_000,
        confirmed: true,
        blockHeight: 119,
      },
    ],
    esploraConfirmedSats: 100_000,
    esploraUnconfirmedSats: 0,
    esploraFundingTxStatuses: [
      {
        txid: 'abc',
        confirmed: true,
        blockHeight: 119,
        blockHash: '00'.repeat(32),
        blockTime: 1_700_000_000,
      },
    ],
    dashboardCardText: 'Spendable (settled)\n0 sats\nPending incoming\n100,000 sats',
    onchainLoadPhase: 'loaded',
    onchainSyncPhase: 'not-syncing',
    syncButtonText: 'Sync on-chain',
    syncButtonEnabled: true,
    syncCaptionText: 'Last synced: 1/1/2025, 12:00:00 AM',
    syncErrorBannerText: null,
    staleEsploraBannerText: null,
    ...overrides,
  }
}

describe('classifyRegtestOnchainBalanceFailure', () => {
  it('detects sync-error banner', () => {
    expect(
      classifyRegtestOnchainBalanceFailure(
        baseSnapshot({ syncErrorBannerText: 'HeaderHashNotFound' }),
      ),
    ).toBe('onchain_sync_error')
  })

  it('detects Esplora not funded', () => {
    expect(
      classifyRegtestOnchainBalanceFailure(
        baseSnapshot({ esploraConfirmedSats: 0, esploraUtxos: [] }),
      ),
    ).toBe('esplora_not_funded')
  })

  it('detects pending incoming only when Esplora is confirmed', () => {
    expect(classifyRegtestOnchainBalanceFailure(baseSnapshot())).toBe('pending_incoming_only')
  })
})

describe('formatRegtestOnchainBalanceDiagnosticReport', () => {
  it('includes failure kind, Esplora UTXOs, and interpretation', () => {
    const report = formatRegtestOnchainBalanceDiagnosticReport(baseSnapshot())
    expect(report).toContain('Failure kind: pending_incoming_only')
    expect(report).toContain('txid=abc')
    expect(report).toContain('bdk_anchor_ready=true')
    expect(report).toContain('Confirmed sats at receive address: 100000')
    expect(report).toContain('indicates a product bug')
  })
})
