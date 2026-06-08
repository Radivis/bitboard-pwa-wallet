import { wrap, type Remote } from 'comlink'
import type { ArkadeService } from '@/workers/arkade-api'
import { resetArkadePersistenceChannel } from '@/workers/arkade-persistence-channel'
import { resetArkadeWorkerSecretsChannel } from '@/workers/secrets-channel'
import { setArkadeSdkPersistenceBridge } from '@/lib/arkade/storage/arkade-sdk-persistence-flush'

export type ArkadeWorkerHealthStatus = 'initializing' | 'healthy' | 'error' | 'crashed'

interface ArkadeWorkerState {
  worker: Worker
  proxy: Remote<ArkadeService>
  status: ArkadeWorkerHealthStatus
  lastError: string | null
  pollTimer: ReturnType<typeof setInterval> | null
}

const HEALTH_POLL_INTERVAL_MS = 5_000
const WORKER_STARTUP_POLL_MS = 25
const WORKER_STARTUP_TIMEOUT_MS = 30_000

let state: ArkadeWorkerState | null = null
const statusListeners = new Set<
  (status: ArkadeWorkerHealthStatus, error: string | null) => void
>()

function notifyListeners() {
  if (!state) return
  for (const listener of statusListeners) {
    listener(state.status, state.lastError)
  }
}

function setStatus(newStatus: ArkadeWorkerHealthStatus, error: string | null = null) {
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
      console.error('[arkade-factory] Health poll failed:', message)
      setStatus('crashed', message)
    }
  }, HEALTH_POLL_INTERVAL_MS)
}

function stopHealthPolling() {
  if (!state?.pollTimer) return
  clearInterval(state.pollTimer)
  state.pollTimer = null
}

async function verifyWorkerHealth(proxy: Remote<ArkadeService>): Promise<void> {
  try {
    await proxy.ping()
    setStatus('healthy')
    console.info('[arkade-factory] Worker health check passed')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[arkade-factory] Worker health check failed:', message)
    setStatus('error', message)
    throw new Error(`Arkade worker failed to initialize: ${message}`, { cause: err })
  }
}

export async function waitForArkadeWorkerHealthy(): Promise<void> {
  getArkadeWorker()
  const deadline = Date.now() + WORKER_STARTUP_TIMEOUT_MS
  for (;;) {
    const { status, lastError } = getArkadeWorkerHealthStatus()
    if (status === 'healthy') return
    if (status === 'error' || status === 'crashed') {
      throw new Error(lastError ?? 'Arkade worker unavailable')
    }
    if (Date.now() >= deadline) {
      throw new Error('Arkade worker did not become ready in time')
    }
    await new Promise((resolve) => setTimeout(resolve, WORKER_STARTUP_POLL_MS))
  }
}

export function getArkadeWorkerIfExists(): Remote<ArkadeService> | null {
  return state?.proxy ?? null
}

export function getArkadeWorker(): Remote<ArkadeService> {
  if (!state) {
    const worker = new Worker(new URL('./arkade.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.addEventListener('error', (event) => {
      const message = event.message || 'Unknown worker error'
      console.error('[arkade-factory] Worker error:', message, event)
      setStatus('crashed', message)
    })

    worker.addEventListener('messageerror', (event) => {
      console.error('[arkade-factory] Worker message error:', event)
      setStatus('crashed', 'Message deserialization failed')
    })

    const proxy = wrap<ArkadeService>(worker)

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

export function terminateArkadeWorker(): void {
  if (state) {
    stopHealthPolling()
    state.worker.terminate()
    state = null
  }
  setArkadeSdkPersistenceBridge(null)
  resetArkadePersistenceChannel()
  resetArkadeWorkerSecretsChannel()
}

export function getArkadeWorkerHealthStatus(): {
  status: ArkadeWorkerHealthStatus
  lastError: string | null
} {
  if (!state) return { status: 'initializing', lastError: null }
  return { status: state.status, lastError: state.lastError }
}

export function onArkadeWorkerHealthChange(
  listener: (status: ArkadeWorkerHealthStatus, error: string | null) => void,
): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}
