import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  formatEsploraTxStatusForDiagnostic,
  isEsploraTxStatusReadyForBdkAnchor,
  parseEsploraTxStatusFromTxEndpointBody,
  type EsploraTxStatusSnapshot,
} from '@/lib/wallet/esplora-tx-anchor-metadata'

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
const REGTEST_COMPOSE_BASE = path.join(REPO_ROOT, 'regtest', 'docker', 'compose.base.yml')
const REGTEST_COMPOSE_ARK = path.join(REPO_ROOT, 'regtest', 'docker', 'compose.ark.yml')
const REGTEST_COMPOSE_PARENT_OVERRIDE = path.join(
  REPO_ROOT,
  'docker',
  'arkade-regtest.override.yml',
)
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
  await waitForEsploraFundingReadyForBdkSync(receiveAddress, sats)
}

async function fetchEsploraTxStatus(txid: string): Promise<EsploraTxStatusSnapshot> {
  try {
    const res = await fetch(`${ESPLORA_URL}/tx/${txid}`)
    if (!res.ok) {
      return {
        txid,
        confirmed: false,
        blockHeight: null,
        blockHash: null,
        blockTime: null,
      }
    }
    return parseEsploraTxStatusFromTxEndpointBody(txid, await res.json())
  } catch {
    return {
      txid,
      confirmed: false,
      blockHeight: null,
      blockHash: null,
      blockTime: null,
    }
  }
}

/**
 * Esplora's /address/.../utxo can show confirmed before /tx exposes block_hash + block_time.
 * BDK Esplora sync needs all three fields to anchor; otherwise the receive stays pending incoming.
 */
export async function waitForEsploraFundingReadyForBdkSync(
  address: string,
  minConfirmedSats: number,
  timeoutMs: number = CONFIRMED_UTXO_WAIT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastTxStatuses: EsploraTxStatusSnapshot[] = []

  while (Date.now() < deadline) {
    const res = await fetch(`${ESPLORA_URL}/address/${address}/utxo`)
    if (res.ok) {
      const utxos: EsploraUtxo[] = await res.json()
      const confirmedUtxos = utxos.filter((utxo) => utxo.status.confirmed)
      const confirmedTotal = confirmedUtxos.reduce((sum, utxo) => sum + utxo.value, 0)
      if (confirmedTotal >= minConfirmedSats && confirmedUtxos.length > 0) {
        lastTxStatuses = await Promise.all(
          confirmedUtxos.map((utxo) => fetchEsploraTxStatus(utxo.txid)),
        )
        if (lastTxStatuses.every(isEsploraTxStatusReadyForBdkAnchor)) {
          return
        }
      }
    }
    await sleep(250)
  }

  const statusLines =
    lastTxStatuses.length > 0
      ? lastTxStatuses.map(formatEsploraTxStatusForDiagnostic).join('\n')
      : '(no confirmed UTXOs observed)'
  throw new Error(
    `Esplora funding not ready for BDK sync within ${timeoutMs}ms (need /tx status with block_height + block_hash + block_time).\n${statusLines}`,
  )
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

const ARKD_REGTEST_ARK_DATADIR_VOLUME =
  process.env.ARKD_REGTEST_ARK_DATADIR_VOLUME ?? 'arkade-regtest_ark_datadir'

const ARKD_REGTEST_IMAGE =
  process.env.ARKD_IMAGE ?? 'ghcr.io/arkade-os/arkd:v0.9.9-rc.1'

const ARKD_ADMIN_REGTEST_URL =
  process.env.ARKD_ADMIN_REGTEST_URL ?? 'http://localhost:7071'

const ARKD_RESTART_HEALTH_TIMEOUT_MS = isCi ? 180_000 : 120_000

const ARKD_CONFIG_CHANGE_HEALTH_TIMEOUT_MS = isCi ? 240_000 : 180_000

/**
 * Rotate the regtest arkd operator signer, deprecating the previous key.
 * `cutoff` is passed to `regtest.mjs rotate-signer --cutoff` (unix seconds or +N/-N from now).
 */
export async function rotateRegtestSigner(cutoff: string = `+${7 * 86_400}`): Promise<void> {
  await runRegtestCli(['rotate-signer', '--cutoff', cutoff])
}

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

/** Baseline values from `.env.regtest` + `regtest/.env.defaults` for operator-trust E2E. */
export const OPERATOR_TRUST_REGTEST_BASELINE = {
  sessionDuration: 30,
  unilateralExitDelay: 20,
  boardingExitDelay: 30,
} as const

/** Overrides applied by {@link applyRegtestOperatorConfigTrustMismatch}. */
export const OPERATOR_TRUST_REGTEST_MISMATCH = {
  sessionDuration: 45,
  unilateralExitDelay: 21,
  boardingExitDelay: 31,
} as const

function regtestComposeArgs(): string[] {
  const args = [
    'compose',
    '-f',
    REGTEST_COMPOSE_BASE,
    '-f',
    REGTEST_COMPOSE_ARK,
  ]
  if (existsSync(REGTEST_COMPOSE_PARENT_OVERRIDE)) {
    args.push('-f', REGTEST_COMPOSE_PARENT_OVERRIDE)
  }
  args.push('--profile', 'base', '--profile', 'ark')
  return args
}

/**
 * Recreate arkd with three getInfo fields changed so operator digest mismatches the wallet's
 * accepted cache. Preserves arkd-wallet and signer; only the arkd process env changes.
 *
 * arkd persists operator config in its SQLite datadir on first boot — env overrides alone do
 * not change getInfo after the server has initialized. This helper stops arkd, wipes
 * `ark_datadir`, starts arkd with mismatch env (fresh init from env), and re-applies intent fees.
 *
 * Call only after the wallet has synced and accepted the baseline operator config.
 */
export async function applyRegtestOperatorConfigTrustMismatch(): Promise<void> {
  const mismatchEnv = {
    ...process.env,
    ARKD_VTXO_TREE_EXPIRY: process.env.ARKD_VTXO_TREE_EXPIRY ?? '200',
    ARKD_PUBLIC_UNILATERAL_EXIT_DELAY: String(
      OPERATOR_TRUST_REGTEST_MISMATCH.unilateralExitDelay,
    ),
    ARKD_CHECKPOINT_EXIT_DELAY: process.env.ARKD_CHECKPOINT_EXIT_DELAY ?? '10',
    ARKD_SESSION_DURATION: String(OPERATOR_TRUST_REGTEST_MISMATCH.sessionDuration),
    ARKD_UNILATERAL_EXIT_DELAY: String(OPERATOR_TRUST_REGTEST_MISMATCH.unilateralExitDelay),
    ARKD_BOARDING_EXIT_DELAY: String(OPERATOR_TRUST_REGTEST_MISMATCH.boardingExitDelay),
  }

  await execFileAsync('docker', [...regtestComposeArgs(), 'stop', 'arkd'], {
    cwd: REPO_ROOT,
    env: mismatchEnv,
    maxBuffer: 10 * 1024 * 1024,
  })

  await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      '-v',
      `${ARKD_REGTEST_ARK_DATADIR_VOLUME}:/app/data`,
      ARKD_REGTEST_IMAGE,
      '-c',
      'rm -rf /app/data/*',
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  )

  await execFileAsync(
    'docker',
    [...regtestComposeArgs(), 'up', '-d', 'arkd'],
    {
      cwd: REPO_ROOT,
      env: mismatchEnv,
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  const { waitForArkadeRegtestHealthy } = await import(
    '../../../../scripts/arkade-regtest-health.mjs'
  )
  await waitForArkadeRegtestHealthy({ timeoutMs: ARKD_CONFIG_CHANGE_HEALTH_TIMEOUT_MS })

  await reapplyRegtestArkdIntentFees()

  await assertRegtestArkdOperatorTrustMismatchConfig()
}

async function assertRegtestArkdOperatorTrustMismatchConfig(): Promise<void> {
  const res = await fetch('http://localhost:7070/v1/info')
  if (!res.ok) {
    throw new Error(`arkd /v1/info failed (${res.status}) after operator config change`)
  }
  const info = (await res.json()) as {
    sessionDuration?: string
    unilateralExitDelay?: string
    boardingExitDelay?: string
  }
  const observed = {
    sessionDuration: info.sessionDuration,
    unilateralExitDelay: info.unilateralExitDelay,
    boardingExitDelay: info.boardingExitDelay,
  }
  const expected = {
    sessionDuration: String(OPERATOR_TRUST_REGTEST_MISMATCH.sessionDuration),
    unilateralExitDelay: String(OPERATOR_TRUST_REGTEST_MISMATCH.unilateralExitDelay),
    boardingExitDelay: String(OPERATOR_TRUST_REGTEST_MISMATCH.boardingExitDelay),
  }
  if (
    observed.sessionDuration !== expected.sessionDuration ||
    observed.unilateralExitDelay !== expected.unilateralExitDelay ||
    observed.boardingExitDelay !== expected.boardingExitDelay
  ) {
    throw new Error(
      `arkd operator config mismatch not applied (observed ${JSON.stringify(observed)}, expected ${JSON.stringify(expected)})`,
    )
  }
}

async function reapplyRegtestArkdIntentFees(): Promise<void> {
  const fees = {
    offchainInputFee: process.env.ARK_OFFCHAIN_INPUT_FEE ?? 'amount * 0.01',
    onchainInputFee: process.env.ARK_ONCHAIN_INPUT_FEE ?? 'amount * 0.01',
    offchainOutputFee: process.env.ARK_OFFCHAIN_OUTPUT_FEE ?? '0.0',
    onchainOutputFee: process.env.ARK_ONCHAIN_OUTPUT_FEE ?? '250.0',
  }
  const res = await fetch(`${ARKD_ADMIN_REGTEST_URL}/v1/admin/intentFees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fees }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Failed to re-apply arkd intent fees (${res.status}): ${detail}`)
  }
}

interface EsploraUtxo {
  txid: string
  vout: number
  value: number
  status: { confirmed: boolean; block_height?: number }
}

/** Send flow needs a non-dust on-chain view; 1000 sats matches typical regtest headroom. */
export const REGTEST_DASHBOARD_MIN_VISIBLE_SATS = 1_000

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
