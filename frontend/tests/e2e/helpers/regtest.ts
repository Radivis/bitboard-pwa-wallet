import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { expect, type Page } from '@playwright/test'
import {
  runDashboardSyncUntilIdle,
  waitForOnchainRailNotSyncing,
} from './dashboard-sync'
import { onChainSpendableSatsFromDashboardBalanceCardText } from './onchain-spendable-balance-text'

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

/** Esplora can lag more on GitHub Actions than on a warm local arkade-regtest stack. */
const ESPLORA_INDEX_WAIT_MS = isCi ? 90_000 : 15_000

const CONFIRMED_UTXO_WAIT_MS = isCi ? 90_000 : 15_000

const ONCHAIN_SYNC_FINISH_TIMEOUT_MS = isCi ? 90_000 : 60_000

/** Same window as Esplora UTXO polling — use when UI must reflect post-sync wallet state. */
export const E2E_CI_AWARE_LONG_WAIT_MS = CONFIRMED_UTXO_WAIT_MS

async function runRegtestCli(args: string[], { capture = false } = {}): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [REGTEST_CLI, ...args], {
      cwd: REPO_ROOT,
      maxBuffer: 10 * 1024 * 1024,
    })
    const trimmedStdout = stdout.trim()
    if (trimmedStdout && !capture) {
      console.log(trimmedStdout)
    }
    if (stderr.trim()) {
      console.warn(stderr.trim())
    }
    return trimmedStdout
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

/** Matches ANSI SGR color sequences (ESC [ … m). Built via RegExp to satisfy no-control-regex. */
const ANSI_SGR_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g')

/** Strip regtest.mjs log lines and ANSI color codes; return the last substantive stdout line. */
function parseCapturedRegtestCliOutput(output: string): string {
  const lines = output
    .replace(ANSI_SGR_ESCAPE_PATTERN, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\[\d{2}:\d{2}:\d{2}\]/.test(line))
  return lines.at(-1) ?? output.trim()
}

/** Fresh bcrt1 address from the regtest node's wallet (for send recipients). */
export async function getRegtestNodeReceiveAddress(): Promise<string> {
  const output = await runRegtestCli(['rpc', 'getnewaddress'], { capture: true })
  const address = parseCapturedRegtestCliOutput(output)
  if (!address.startsWith('bcrt1')) {
    throw new Error(`Expected bcrt1 node address, got: ${output}`)
  }
  return address
}

/**
 * Fund a wallet receive address on-chain and wait until Esplora reports confirmed UTXOs.
 */
export async function fundRegtestWalletReceiveAddress(
  receiveAddress: string,
  sats: number = DEFAULT_FAUCET_SATS,
): Promise<void> {
  await fundRegtestAddress(receiveAddress, sats)
  await mineRegtestBlocks(1)
  await waitForConfirmedBalance(receiveAddress, sats)
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
export const REGTEST_DASHBOARD_MIN_VISIBLE_SATS = 1_000

/** Each regtest dashboard sync is a full Esplora scan and can take most of ONCHAIN_SYNC_FINISH_TIMEOUT_MS on CI. */
const DASHBOARD_FUNDED_BALANCE_POLL_TIMEOUT_MS = isCi
  ? Math.max(480_000, ONCHAIN_SYNC_FINISH_TIMEOUT_MS * 5 + 60_000)
  : Math.max(60_000, E2E_CI_AWARE_LONG_WAIT_MS)

const DASHBOARD_FUNDED_BALANCE_MAX_MANUAL_SYNCS = isCi ? 6 : 3

async function esploraConfirmedSatsForAddress(address: string): Promise<number> {
  const res = await fetch(`${ESPLORA_URL}/address/${address}/utxo`)
  if (!res.ok) {
    return 0
  }
  const utxos: EsploraUtxo[] = await res.json()
  return utxos
    .filter((utxo) => utxo.status.confirmed)
    .reduce((sum, utxo) => sum + utxo.value, 0)
}

export type WaitForDashboardFundedOnChainBalanceOptions = {
  /** When set, poll Esplora before each manual sync so BDK is not blamed for indexer lag. */
  receiveAddress?: string
  minConfirmedSats?: number
}

/**
 * After regtest fund + mine + Esplora polling, the dashboard can still show 0 until BDK
 * finishes ingesting the sync.
 */
export async function waitForDashboardShowsFundedOnChainBalance(
  page: Page,
  options: WaitForDashboardFundedOnChainBalanceOptions = {},
): Promise<void> {
  const minVisibleSats = options.minConfirmedSats ?? REGTEST_DASHBOARD_MIN_VISIBLE_SATS
  const receiveAddress = options.receiveAddress
  const card = page.locator('[data-infomode-id="dashboard-balance-card"]')
  const syncButton = page.getByTestId('rail-sync-onchain')
  let manualSyncAttempts = 0

  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(
      async () => {
        const text = (await card.innerText()) ?? ''
        if (onChainSpendableSatsFromDashboardBalanceCardText(text) >= minVisibleSats) {
          return true
        }

        if (receiveAddress != null) {
          const esploraConfirmedSats = await esploraConfirmedSatsForAddress(receiveAddress)
          if (esploraConfirmedSats < minVisibleSats) {
            return false
          }
        }

        const syncButtonText = (await syncButton.innerText().catch(() => '')) ?? ''
        if (/Syncing/i.test(syncButtonText)) {
          return false
        }

        if (manualSyncAttempts >= DASHBOARD_FUNDED_BALANCE_MAX_MANUAL_SYNCS) {
          return false
        }

        const syncEnabled = await syncButton.isEnabled().catch(() => false)
        if (!syncEnabled) {
          await waitForOnchainRailNotSyncing(page, 15_000).catch(() => {})
          return false
        }

        manualSyncAttempts += 1
        try {
          await runDashboardSyncUntilIdle(page)
        } catch {
          // Esplora/BDK may still be catching up; keep polling.
        }
        return false
      },
      {
        timeout: DASHBOARD_FUNDED_BALANCE_POLL_TIMEOUT_MS,
        intervals: [300, 600, 1200, 2000],
        message:
          'Dashboard on-chain spendable balance still looks empty (pending incoming does not count; BDK may not have caught Esplora yet)',
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
