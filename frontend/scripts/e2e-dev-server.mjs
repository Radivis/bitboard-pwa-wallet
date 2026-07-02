#!/usr/bin/env node
/**
 * Playwright webServer entrypoint: start Vite for E2E and log readiness progress.
 * Playwright polls `E2E_DEV_SERVER_ORIGIN`; this script keeps Vite alive and reports
 * when the URL responds (or if Vite exits early).
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.E2E_DEV_SERVER_PORT ?? '3100'
const origin = `http://127.0.0.1:${port}`
const progressIntervalMs = 5_000

let viteReady = false
let viteExited = false
let viteExitCode = 0

async function probeDevServer() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(origin, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function logUntilReady() {
  console.log(`[e2e dev server] starting Vite on ${origin} (node ${process.version})…`)
  let attempt = 0
  while (!viteReady && !viteExited) {
    attempt += 1
    if (await probeDevServer()) {
      viteReady = true
      console.log(`[e2e dev server] ${origin} is ready (probe ${attempt})`)
      return
    }
    console.log(
      `[e2e dev server] still waiting for ${origin} — Vite compiling? (probe ${attempt})`,
    )
    await sleep(progressIntervalMs)
  }
}

const child = spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: frontendRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout?.on('data', (chunk) => {
  process.stdout.write(chunk)
})
child.stderr?.on('data', (chunk) => {
  process.stderr.write(chunk)
})

child.on('exit', (code) => {
  viteExited = true
  viteExitCode = code ?? 1
  if (!viteReady) {
    console.error(
      `[e2e dev server] Vite exited with code ${viteExitCode} before ${origin} became ready`,
    )
    process.exit(viteExitCode)
  }
  process.exit(viteExitCode)
})

void logUntilReady()
