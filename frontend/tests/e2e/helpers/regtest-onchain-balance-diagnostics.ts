import { expect, type Page } from '@playwright/test'

import {
  formatRegtestOnchainBalanceDiagnosticReport,
  type RegtestEsploraUtxoSnapshot,
  type RegtestOnchainBalanceDiagnosticSnapshot,
} from '@/lib/wallet/regtest-onchain-balance-diagnostics'
import { onChainSpendableSatsFromDashboardBalanceCardText } from './onchain-spendable-balance-text'
import { runDashboardSyncUntilIdle } from './dashboard-sync'
import { ESPLORA_URL } from './regtest'

interface EsploraUtxoResponse {
  txid: string
  vout: number
  value: number
  status: { confirmed: boolean; block_height?: number }
}

async function fetchEsploraTipHeight(): Promise<number | null> {
  try {
    const res = await fetch(`${ESPLORA_URL}/blocks/tip/height`)
    if (!res.ok) return null
    const height = parseInt(await res.text(), 10)
    return Number.isFinite(height) ? height : null
  } catch {
    return null
  }
}

async function fetchEsploraUtxos(address: string): Promise<EsploraUtxoResponse[]> {
  try {
    const res = await fetch(`${ESPLORA_URL}/address/${address}/utxo`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

function mapEsploraUtxos(utxos: EsploraUtxoResponse[]): RegtestEsploraUtxoSnapshot[] {
  return utxos.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    confirmed: utxo.status.confirmed,
    blockHeight: utxo.status.block_height ?? null,
  }))
}

async function readOptionalVisibleText(page: Page, testId: string): Promise<string | null> {
  const locator = page.getByTestId(testId)
  if (!(await locator.isVisible().catch(() => false))) {
    return null
  }
  const text = (await locator.innerText().catch(() => '')) ?? ''
  return text.trim().length > 0 ? text.trim() : null
}

/**
 * Collects a structured snapshot from Esplora + the live dashboard for CI failure logs.
 */
export async function collectRegtestOnchainBalanceDiagnosticSnapshot(
  page: Page,
  options: {
    receiveAddress: string
    minRequiredSpendableSats: number
    parsedDashboardSpendableSats: number
  },
): Promise<RegtestOnchainBalanceDiagnosticSnapshot> {
  const card = page.locator('[data-infomode-id="dashboard-balance-card"]')
  const onchainRail = card.locator('[data-rail-onchain-load]').first()
  const syncButton = page.getByTestId('rail-sync-onchain')
  const syncCaption = page.getByTestId('rail-sync-onchain-caption')

  const utxos = await fetchEsploraUtxos(options.receiveAddress)
  const mappedUtxos = mapEsploraUtxos(utxos)
  const esploraConfirmedSats = mappedUtxos
    .filter((utxo) => utxo.confirmed)
    .reduce((sum, utxo) => sum + utxo.value, 0)
  const esploraUnconfirmedSats = mappedUtxos
    .filter((utxo) => !utxo.confirmed)
    .reduce((sum, utxo) => sum + utxo.value, 0)

  return {
    receiveAddress: options.receiveAddress,
    minRequiredSpendableSats: options.minRequiredSpendableSats,
    parsedDashboardSpendableSats: options.parsedDashboardSpendableSats,
    esploraApiUrl: ESPLORA_URL,
    esploraTipHeight: await fetchEsploraTipHeight(),
    esploraUtxos: mappedUtxos,
    esploraConfirmedSats,
    esploraUnconfirmedSats,
    dashboardCardText: (await card.innerText().catch(() => '')) ?? '',
    onchainLoadPhase: await onchainRail.getAttribute('data-rail-onchain-load'),
    onchainSyncPhase: await onchainRail.getAttribute('data-rail-onchain-sync'),
    syncButtonText: ((await syncButton.innerText().catch(() => '')) ?? '').trim(),
    syncButtonEnabled: await syncButton.isEnabled().catch(() => false),
    syncCaptionText: ((await syncCaption.innerText().catch(() => '')) ?? '').trim(),
    syncErrorBannerText: await readOptionalVisibleText(page, 'wallet-sync-error-banner-onchain'),
    staleEsploraBannerText: await readOptionalVisibleText(page, 'onchain-esplora-stale-banner'),
  }
}

export async function formatRegtestOnchainBalanceDiagnosticReportFromPage(
  page: Page,
  options: {
    receiveAddress: string
    minRequiredSpendableSats: number
    parsedDashboardSpendableSats: number
  },
): Promise<string> {
  const snapshot = await collectRegtestOnchainBalanceDiagnosticSnapshot(page, options)
  return formatRegtestOnchainBalanceDiagnosticReport(snapshot)
}

/**
 * Strict post-sync assertion: one sync is the test's responsibility; no polls or repair retries here.
 */
export async function assertDashboardSpendableOnChainBalance(
  page: Page,
  options: {
    receiveAddress: string
    minConfirmedSats: number
  },
): Promise<void> {
  const card = page.locator('[data-infomode-id="dashboard-balance-card"]')
  await expect(card).toBeVisible({ timeout: 10_000 })

  const cardText = (await card.innerText()) ?? ''
  const parsedSpendableSats = onChainSpendableSatsFromDashboardBalanceCardText(cardText)
  if (parsedSpendableSats >= options.minConfirmedSats) {
    return
  }

  const report = await formatRegtestOnchainBalanceDiagnosticReportFromPage(page, {
    receiveAddress: options.receiveAddress,
    minRequiredSpendableSats: options.minConfirmedSats,
    parsedDashboardSpendableSats: parsedSpendableSats,
  })
  throw new Error(report)
}

/**
 * One Sync on-chain after regtest funding, then a strict spendable-balance assertion.
 * No polls, retries, or Full rescan — either step failing emits the full diagnostic report.
 */
export async function runRegtestPostFundDashboardCheck(
  page: Page,
  options: {
    receiveAddress: string
    minConfirmedSats: number
  },
): Promise<void> {
  try {
    await runDashboardSyncUntilIdle(page)
  } catch (error) {
    const report = await formatRegtestOnchainBalanceDiagnosticReportFromPage(page, {
      receiveAddress: options.receiveAddress,
      minRequiredSpendableSats: options.minConfirmedSats,
      parsedDashboardSpendableSats: 0,
    })
    throw new Error(
      `Regtest post-fund on-chain sync did not succeed (see sync-error banner section if present).\n\n${report}`,
      { cause: error },
    )
  }

  await assertDashboardSpendableOnChainBalance(page, options)
}
