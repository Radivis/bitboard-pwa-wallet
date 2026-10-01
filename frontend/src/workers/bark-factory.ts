import { wrap, type Remote } from 'comlink'
import { configureWorkerHistoricalSignetOnchainChain } from '@/lib/wallet/live-network-split-migration'
import { resetBarkPersistenceChannel } from '@/workers/bark-persistence-channel'
import { resetBarkWorkerSecretsChannel } from '@/workers/secrets-channel'
import type { BarkService } from '@/workers/bark-api'

export type BarkWorkerHealthStatus = 'initializing' | 'healthy' | 'error' | 'crashed'

interface BarkWorkerState {
  worker: Worker
  proxy: Remote<BarkService>
  status: BarkWorkerHealthStatus
  lastError: string | null
  pollTimer: ReturnType<typeof setInterval> | null
}

const HEALTH_POLL_INTERVAL_MS = 5_000
const WORKER_STARTUP_POLL_MS = 25
const WORKER_STARTUP_TIMEOUT_MS = 30_000

let state: BarkWorkerState | null = null
const statusListeners = new Set<
  (status: BarkWorkerHealthStatus, error: string | null) => void
>()

function notifyListeners() {
  if (!state) return
  for (const listener of statusListeners) {
    listener(state.status, state.lastError)
  }
}

function setStatus(newStatus: BarkWorkerHealthStatus, error: string | null = null) {
  if (!state) return
  state.status = newStatus
  state.lastError = error
  notifyListeners()
}

function startHealthPolling() {
  if (!state || state.pollTimer) return

  state.pollTimer = setInterval(async () => {
    if (!state) return
    try {
      await state.proxy.ping()
      if (state.status === 'crashed') {
        setStatus('healthy')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[bark-factory] Health poll failed:', message)
      setStatus('crashed', message)
    }
  }, HEALTH_POLL_INTERVAL_MS)
}

function stopHealthPolling() {
  if (!state?.pollTimer) return
  clearInterval(state.pollTimer)
  state.pollTimer = null
}

async function verifyWorkerHealth(proxy: Remote<BarkService>): Promise<void> {
  try {
    await proxy.ping()
    await configureWorkerHistoricalSignetOnchainChain((chain) =>
      proxy.configureHistoricalSignetOnchainChain(chain),
    )
    setStatus('healthy')
    console.info('[bark-factory] Worker health check passed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[bark-factory] Worker health check failed:', message)
    setStatus('error', message)
    throw new Error(`Bark worker failed to initialize: ${message}`, { cause: err })
  }
}

export async function waitForBarkWorkerHealthy(): Promise<void> {
  getBarkWorker()
  const deadline = Date.now() + WORKER_STARTUP_TIMEOUT_MS
  for (;;) {
    const { status, lastError } = getBarkWorkerHealthStatus()
    if (status === 'healthy') return
    if (status === 'error' || status === 'crashed') {
      throw new Error(lastError ?? 'Bark worker unavailable')
    }
    if (Date.now() >= deadline) {
      throw new Error('Bark worker did not become ready in time')
    }
    await new Promise((resolve) => setTimeout(resolve, WORKER_STARTUP_POLL_MS))
  }
}

export function getBarkWorkerIfExists(): Remote<BarkService> | null {
  return state?.proxy ?? null
}

export function getBarkWorker(): Remote<BarkService> {
  if (!state) {
    const worker = new Worker(new URL('./bark.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('error', (event) => {
      const message = event.message || 'Unknown worker error'
      console.error('[bark-factory] Worker error:', message, event)
      setStatus('crashed', message)
    })

    worker.addEventListener('messageerror', (event) => {
      console.error('[bark-factory] Worker message error:', event)
      setStatus('crashed', 'Message deserialization failed')
    })

    const proxy = wrap<BarkService>(worker)

    state = {
      worker,
      proxy,
      status: 'initializing',
      lastError: null,
      pollTimer: null,
    }

    verifyWorkerHealth(proxy)
      .then(() => {
        startHealthPolling()
      })
      .catch(() => {
        startHealthPolling()
      })
  }
  return state.proxy
}

/** Stops the worker. Does not delete Bark's IndexedDB database. */
export function terminateBarkWorker(): void {
  if (state) {
    stopHealthPolling()
    state.worker.terminate()
    state = null
  }
  resetBarkPersistenceChannel()
  resetBarkWorkerSecretsChannel()
}

export function getBarkWorkerHealthStatus(): {
  status: BarkWorkerHealthStatus
  lastError: string | null
} {
  if (!state) return { status: 'initializing', lastError: null }
  return { status: state.status, lastError: state.lastError }
}

export function onBarkWorkerHealthChange(
  listener: (status: BarkWorkerHealthStatus, error: string | null) => void,
): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}
