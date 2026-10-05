#!/usr/bin/env node
/**
 * Health and round-wallet funding for captaind on the arkade-regtest chain.
 * Used by scripts/start-bark-regtest.sh, scripts/wait-bark-regtest-health.sh,
 * and Playwright globalSetup when REQUIRE_BARK_REGTEST=1.
 *
 * Healthy means the public gRPC port accepts a connection and the round wallet
 * holds confirmed coins. A listening port alone is not enough.
 */
import { spawnSync } from 'node:child_process'
import net from 'node:net'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

export const CAPTAIND_REGTEST_PORT = Number(process.env.CAPTAIND_PORT ?? 3535)
export const CAPTAIND_REGTEST_CONTAINER =
  process.env.CAPTAIND_REGTEST_CONTAINER ?? 'bitboard-regtest-captaind'

/** One bitcoin. Later starts skip the faucet once any trusted balance is present. */
const FUND_BTC = '1'

const DEFAULT_POLL_MS = 2_000
const DEFAULT_PROGRESS_MS = 15_000

function defaultTimeoutMs() {
  const override = process.env.BARK_REGTEST_HEALTH_TIMEOUT_MS
  if (override != null && override !== '') {
    const parsed = Number(override)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return process.env.CI ? 180_000 : 120_000
}

function repoRootFromScript() {
  return new URL('..', import.meta.url).pathname
}

export function readCaptaindRoundWallet() {
  const result = spawnSync(
    'docker',
    ['exec', CAPTAIND_REGTEST_CONTAINER, 'captaind', 'rpc', 'wallet'],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout)
    const rounds = parsed?.rounds
    if (rounds == null || typeof rounds.address !== 'string' || rounds.address.length === 0) {
      return null
    }
    const trustedBalanceSats = Number(rounds.trusted_balance)
    const untrustedBalanceSats = Number(rounds.untrusted_balance)
    const totalBalanceSats = Number(rounds.total_balance)
    if (!Number.isFinite(trustedBalanceSats)) return null
    const confirmedUtxoCount = Array.isArray(rounds.confirmed_utxos)
      ? rounds.confirmed_utxos.length
      : 0
    return {
      address: rounds.address,
      trustedBalanceSats,
      untrustedBalanceSats: Number.isFinite(untrustedBalanceSats) ? untrustedBalanceSats : 0,
      totalBalanceSats: Number.isFinite(totalBalanceSats) ? totalBalanceSats : 0,
      confirmedUtxoCount,
    }
  } catch {
    return null
  }
}

function publicPortAcceptsConnection() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: CAPTAIND_REGTEST_PORT })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(2_000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export async function checkBarkRegtestHealthy() {
  const portOpen = await publicPortAcceptsConnection()
  if (!portOpen) return false
  const wallet = readCaptaindRoundWallet()
  return wallet != null && wallet.trustedBalanceSats > 0
}

function runRegtestCli(args) {
  const result = spawnSync('node', ['regtest/regtest.mjs', ...args], {
    cwd: repoRootFromScript(),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const detail = `${result.stderr || ''}\n${result.stdout || ''}`.trim()
    throw new Error(`regtest ${args.join(' ')} failed: ${detail}`)
  }
}

function faucetRoundWallet(address) {
  runRegtestCli(['faucet', address, FUND_BTC, '--confirm'])
}

function roundWalletHasCoins(wallet) {
  return (
    wallet.totalBalanceSats > 0 ||
    wallet.untrustedBalanceSats > 0 ||
    wallet.confirmedUtxoCount > 0
  )
}

/**
 * Wait until admin RPC reports a round-wallet address, then send 1 BTC when
 * the confirmed balance is under one bitcoin. Restart keeps the volume.
 */
export async function fundCaptaindRoundWalletIfNeeded(options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs()
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const deadline = Date.now() + timeoutMs

  let wallet = null
  while (Date.now() < deadline) {
    wallet = readCaptaindRoundWallet()
    if (wallet != null) break
    await sleep(pollMs)
  }
  if (wallet == null) {
    throw new Error(
      `captaind round wallet did not answer within ${timeoutMs}ms (${CAPTAIND_REGTEST_CONTAINER})`,
    )
  }
  if (wallet.trustedBalanceSats > 0) {
    console.log(
      `captaind round wallet already funded (${wallet.trustedBalanceSats} sats at ${wallet.address})`,
    )
    return
  }

  if (!roundWalletHasCoins(wallet)) {
    console.log(`Funding captaind round wallet at ${wallet.address} (${FUND_BTC} BTC)...`)
    faucetRoundWallet(wallet.address)
  }

  // One confirmation leaves the coin untrusted. Mine until captaind reports trusted sats.
  let minesSinceCoins = 0
  while (Date.now() < deadline) {
    const funded = readCaptaindRoundWallet()
    if (funded != null && funded.trustedBalanceSats > 0) {
      console.log(`captaind round wallet balance: ${funded.trustedBalanceSats} sats`)
      return
    }
    if (funded != null && roundWalletHasCoins(funded)) {
      if (minesSinceCoins >= 12) {
        throw new Error(
          `captaind round wallet has coins but trusted_balance stayed 0 after ${minesSinceCoins} extra blocks`,
        )
      }
      runRegtestCli(['mine', '1'])
      minesSinceCoins += 1
    }
    await sleep(pollMs)
  }
  throw new Error(`captaind round wallet stayed empty after faucet (${wallet.address})`)
}

export async function waitForBarkRegtestHealthy(options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs()
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const progressMs = options.progressMs ?? DEFAULT_PROGRESS_MS
  const deadline = Date.now() + timeoutMs
  let lastProgress = 0

  while (Date.now() < deadline) {
    if (await checkBarkRegtestHealthy()) return
    const now = Date.now()
    if (now - lastProgress >= progressMs) {
      const portOpen = await publicPortAcceptsConnection()
      const wallet = readCaptaindRoundWallet()
      const waiting = []
      if (!portOpen) waiting.push(`public RPC :${CAPTAIND_REGTEST_PORT}`)
      if (wallet == null) waiting.push('round wallet RPC')
      else if (wallet.trustedBalanceSats <= 0) waiting.push('round wallet coins')
      console.log(
        `[bark-regtest health] still waiting for ${waiting.join(' + ')} (${Math.round(
          (deadline - now) / 1000,
        )}s left)`,
      )
      lastProgress = now
    }
    await sleep(pollMs)
  }

  throw new Error(
    `bark-regtest not healthy within ${timeoutMs}ms — captaind public RPC and a funded round wallet are required`,
  )
}

const isMain =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain && process.argv.includes('--fund')) {
  fundCaptaindRoundWalletIfNeeded()
    .then(() => waitForBarkRegtestHealthy())
    .then(() => {
      console.log('bark-regtest health check passed (captaind RPC + round wallet).')
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
} else if (isMain && process.argv.includes('--wait')) {
  waitForBarkRegtestHealthy()
    .then(() => {
      console.log('bark-regtest health check passed (captaind RPC + round wallet).')
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
