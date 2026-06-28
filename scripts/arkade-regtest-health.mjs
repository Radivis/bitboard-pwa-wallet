#!/usr/bin/env node
/**
 * Shared health probes for arkade-regtest (Esplora :7030/api + arkd :7070).
 * Used by scripts/wait-arkade-regtest-health.sh and Playwright globalSetup.
 */
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

export const ESPLORA_REGTEST_API_URL =
  process.env.ESPLORA_REGTEST_API_URL ?? 'http://localhost:7030/api'
export const ARKD_REGTEST_URL = process.env.ARKD_REGTEST_URL ?? 'http://localhost:7070'

const DEFAULT_POLL_MS = 2_000
const DEFAULT_PROGRESS_MS = 15_000

function defaultTimeoutMs() {
  const override = process.env.ARKADE_REGTEST_HEALTH_TIMEOUT_MS
  if (override != null && override !== '') {
    const parsed = Number(override)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return process.env.CI ? 180_000 : 120_000
}

async function fetchText(url, timeoutMs = 8_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return { ok: res.ok, status: res.status, text: await res.text() }
  } catch {
    return { ok: false, status: 0, text: '' }
  } finally {
    clearTimeout(timer)
  }
}

export async function checkEsploraHealthy() {
  const { ok, text } = await fetchText(
    `${ESPLORA_REGTEST_API_URL.replace(/\/$/, '')}/blocks/tip/height`,
  )
  if (!ok) return false
  const height = parseInt(text.trim(), 10)
  return Number.isFinite(height) && height >= 0
}

export async function checkArkdHealthy() {
  const { ok, text } = await fetchText(`${ARKD_REGTEST_URL.replace(/\/$/, '')}/v1/info`)
  if (!ok) return false
  try {
    const json = JSON.parse(text)
    return Boolean(json?.signerPubkey || json?.pubkey)
  } catch {
    return false
  }
}

export async function waitForArkadeRegtestHealthy(options = {}) {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs()
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const progressMs = options.progressMs ?? DEFAULT_PROGRESS_MS
  const deadline = Date.now() + timeoutMs
  let lastProgress = 0

  while (Date.now() < deadline) {
    const esploraOk = await checkEsploraHealthy()
    const arkdOk = await checkArkdHealthy()
    if (esploraOk && arkdOk) {
      return
    }
    const now = Date.now()
    if (now - lastProgress >= progressMs) {
      const waiting = []
      if (!esploraOk) waiting.push('Esplora')
      if (!arkdOk) waiting.push('arkd')
      console.log(
        `[arkade-regtest health] still waiting for ${waiting.join(' + ')} (${Math.round(
          (deadline - now) / 1000,
        )}s left)`,
      )
      lastProgress = now
    }
    await sleep(pollMs)
  }

  const esploraOk = await checkEsploraHealthy()
  const arkdOk = await checkArkdHealthy()
  const still = []
  if (!esploraOk) still.push(`Esplora (${ESPLORA_REGTEST_API_URL})`)
  if (!arkdOk) still.push(`arkd (${ARKD_REGTEST_URL}/v1/info)`)
  throw new Error(
    `arkade-regtest not healthy within ${timeoutMs}ms — pending: ${still.join(', ')}`,
  )
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain && process.argv.includes('--wait')) {
  waitForArkadeRegtestHealthy()
    .then(() => {
      console.log('arkade-regtest health check passed (Esplora + arkd).')
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
