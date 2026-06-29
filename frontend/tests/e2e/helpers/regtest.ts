import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { expect, type Page } from '@playwright/test'
import { maxSatsInTextFromFormattedBitcoinAmountDisplays } from '@/lib/wallet/bitcoin-amount-text-parse'

/**
 * Helpers for E2E tests that use the arkade-regtest environment.
 * Requires the stack to be running: npm run regtest:start (or use test:e2e:regtest / test:e2e:arkade-regtest).
 *
 * Faucet / mine via `node regtest/regtest.mjs` (replaces bitcoinerlab/tester :8880).
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)
const REGTEST_CLI = path.join(REPO_ROOT, 'regtest', 'regtest.mjs')
export const ESPLORA_URL = 'http://localhost:7030/api'
const DEFAULT_FAUCET_SATS = 100_000

const execFileAsync = promisify(execFile)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isCi = !!process.env.CI

/** Re-export for specs that need CI branching but should not depend on `process` typing. */
export const E2E_IS_CI = isCi

/** Esplora can lag more on GitHub Actions than on a warm local Docker setup. */
const ESPLORA_INDEX_WAIT_MS = isCi ? 60_000 : 15_000

const CONFIRMED_UTXO_WAIT_MS = isCi ? 60_000 : 15_000

/** Same window as Esplora UTXO polling — use when UI must reflect post-sync wallet state. */
export const E2E_CI_AWARE_LONG_WAIT_MS = CONFIRMED_UTXO_WAIT_MS

async function runRegtestCli(args: string[]): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [REGTEST_CLI, ...args], {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (stdout.trim()) {
      console.log(stdout.trim())
    }
    if (stderr.trim()) {
      console.warn(stderr.trim())
    }
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'regtest.mjs failed'
    throw new Error(`regtest.mjs ${args.join(' ')} failed: ${detail}`, { cause: error })
  }
}

function satsToBtcString(sats: number): string {
  return (sats / 100_000_000).toFixed(8)
}

/**
 * Send BTC from the regtest node wallet to the given address (mines 1 block when --confirm).
 */
export async function fundRegtestAddress(
  address: string,
  sats: number = DEFAULT_FAUCET_SATS,
): Promise<void> {
  await runRegtestCli(['faucet', address, satsToBtcString(sats), '--confirm'])
}

/** Get the current block height as seen by the Esplora indexer. */
async function getEsploraBlockHeight(): Promise<number> {
  const res = await fetch(`${ESPLORA_URL}/blocks/tip/height`)
  if (!res.ok) {
    throw new Error(`Esplora tip/height failed (${res.status})`)
  }
  return parseInt(await res.text(), 10)
}

/**
 * Mine one or more blocks, then wait until the Esplora indexer has caught up.
 */
export async function mineRegtestBlocks(count: number = 1): Promise<void> {
  const heightBefore = await getEsploraBlockHeight()
  await runRegtestCli(['mine', String(count)])

  const expectedHeight = heightBefore + count
  const deadline = Date.now() + ESPLORA_INDEX_WAIT_MS
  while (Date.now() < deadline) {
    const currentHeight = await getEsploraBlockHeight()
    if (currentHeight >= expectedHeight) return
    await sleep(200)
  }

  throw new Error(
    `Esplora did not index to height ${expectedHeight} within ${ESPLORA_INDEX_WAIT_MS / 1000}s (stuck at ${await getEsploraBlockHeight()})`,
  )
}

/**
 * arkd container name (compose project `bitboard-regtest`). Overridable for non-default setups.
 */
const ARKD_REGTEST_CONTAINER =
  process.env.ARKD_REGTEST_CONTAINER ?? 'bitboard-regtest-arkd'

const ARKD_RESTART_HEALTH_TIMEOUT_MS = isCi ? 180_000 : 120_000

/**
 * Restart the arkd operator and wait until it is healthy again.
 *
 * The serial @arkade-regtest suite shares one operator. arkd keeps its live intent/round queue in
 * memory (`LiveStoreType: inmemory`), so a single interrupted settle round can leave a stuck intent
 * that fails every subsequent round (`missing forfeit tx` → `not enough intent confirmations`) and
 * cascades into later tests. Restarting the container clears that in-memory queue while preserving
 * the persisted server wallet and configured intent fees, giving each test a clean operator.
 */
export async function restartArkadeOperator(): Promise<void> {
  await execFileAsync('docker', ['restart', ARKD_REGTEST_CONTAINER], {
    maxBuffer: 10 * 1024 * 1024,
  })
  const { waitForArkadeRegtestHealthy } = await import(
    '../../../../scripts/arkade-regtest-health.mjs'
  )
  await waitForArkadeRegtestHealthy({ timeoutMs: ARKD_RESTART_HEALTH_TIMEOUT_MS })
}

interface EsploraUtxo {
  txid: string
  vout: number
  value: number
  status: { confirmed: boolean; block_height?: number }
}

/** Send flow needs a non-dust on-chain view; 1000 sats matches typical regtest headroom. */
const REGTEST_DASHBOARD_MIN_VISIBLE_SATS = 1_000

/**
 * After regtest fund + mine + Esplora polling, the dashboard can still show 0 until BDK
 * finishes ingesting the sync.
 */
export async function waitForDashboardShowsFundedOnChainBalance(page: Page): Promise<void> {
  const card = page.locator('[data-infomode-id="dashboard-balance-card"]')
  const timeoutMs = isCi
    ? Math.max(120_000, E2E_CI_AWARE_LONG_WAIT_MS)
    : Math.max(60_000, E2E_CI_AWARE_LONG_WAIT_MS)
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(
      async () => {
        const text = (await card.innerText()) ?? ''
        return (
          maxSatsInTextFromFormattedBitcoinAmountDisplays(text) >=
          REGTEST_DASHBOARD_MIN_VISIBLE_SATS
        )
      },
      {
        timeout: timeoutMs,
        intervals: [200, 400, 800, 1500],
        message:
          'Dashboard on-chain balance still looks empty (BDK may not have caught Esplora yet)',
      },
    )
    .toBe(true)
}

/**
 * Poll the Esplora API until the given address has at least `minConfirmedSats`
 * in confirmed UTXOs.
 */
export async function waitForConfirmedBalance(
  address: string,
  minConfirmedSats: number,
  timeoutMs: number = CONFIRMED_UTXO_WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${ESPLORA_URL}/address/${address}/utxo`)
    if (res.ok) {
      const utxos: EsploraUtxo[] = await res.json()
      const confirmedTotal = utxos
        .filter((u) => u.status.confirmed)
        .reduce((sum, u) => sum + u.value, 0)
      if (confirmedTotal >= minConfirmedSats) return
    }
    await sleep(250)
  }

  throw new Error(
    `Esplora did not show ≥${minConfirmedSats} confirmed sats for ${address} within ${timeoutMs}ms`,
  )
}
