import { wrap, type Remote } from 'comlink'
import { configureWorkerHistoricalSignetOnchainChain } from '@/lib/wallet/live-network-split-migration'
import type { HistoricalSignetOnchainChain } from '@/lib/wallet/historical-signet-onchain-chain'

export type RailWorkerHealthStatus = 'initializing' | 'healthy' | 'error' | 'crashed'

export interface RailWorkerService {
  ping(): Promise<unknown>
  configureHistoricalSignetOnchainChain(
    chain: HistoricalSignetOnchainChain | null,
  ): Promise<void>
}

interface RailWorkerState<TService> {
  worker: Worker
  proxy: Remote<TService>
  status: RailWorkerHealthStatus
  lastError: string | null
  pollTimer: ReturnType<typeof setInterval> | null
}

const HEALTH_POLL_INTERVAL_MS = 5_000
const WORKER_STARTUP_POLL_MS = 25
const WORKER_STARTUP_TIMEOUT_MS = 30_000

export interface RailWorkerControllerOptions {
  /** Log prefix without brackets, for example `arkade-factory`. */
  logPrefix: string
  /** Display name used in thrown errors, for example `Arkade`. */
  workerName: string
  createWorker: () => Worker
  formatWorkerError?: (event: ErrorEvent) => string
  logWorkerError?: (message: string, event: ErrorEvent) => void
  /** Runs on every terminate, including when no worker is alive. */
  onTerminate?: () => void
}

export interface RailWorkerController<TService> {
  waitUntilHealthy: () => Promise<void>
  getIfExists: () => Remote<TService> | null
  get: () => Remote<TService>
  terminate: () => void
  getHealthStatus: () => { status: RailWorkerHealthStatus; lastError: string | null }
  onHealthChange: (
    listener: (status: RailWorkerHealthStatus, error: string | null) => void,
  ) => () => void
}

function defaultWorkerErrorMessage(event: ErrorEvent): string {
  return event.message || 'Unknown worker error'
}

export function createRailWorkerController<TService extends RailWorkerService>(
  options: RailWorkerControllerOptions,
): RailWorkerController<TService> {
  const formatWorkerError = options.formatWorkerError ?? defaultWorkerErrorMessage
  let state: RailWorkerState<TService> | null = null
  const statusListeners = new Set<
    (status: RailWorkerHealthStatus, error: string | null) => void
  >()

  function notifyListeners() {
    if (!state) return
    for (const listener of statusListeners) {
      listener(state.status, state.lastError)
    }
  }

  function setStatus(newStatus: RailWorkerHealthStatus, error: string | null = null) {
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
        console.error(`[${options.logPrefix}] Health poll failed:`, message)
        setStatus('crashed', message)
      }
    }, HEALTH_POLL_INTERVAL_MS)
  }

  function stopHealthPolling() {
    if (!state?.pollTimer) return
    clearInterval(state.pollTimer)
    state.pollTimer = null
  }

  async function verifyWorkerHealth(proxy: Remote<TService>): Promise<void> {
    try {
      await proxy.ping()
      await configureWorkerHistoricalSignetOnchainChain((chain) =>
        proxy.configureHistoricalSignetOnchainChain(chain),
      )
      setStatus('healthy')
      console.info(`[${options.logPrefix}] Worker health check passed`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[${options.logPrefix}] Worker health check failed:`, message)
      setStatus('error', message)
      throw new Error(`${options.workerName} worker failed to initialize: ${message}`, {
        cause: err,
      })
    }
  }

  function getHealthStatus(): { status: RailWorkerHealthStatus; lastError: string | null } {
    if (!state) return { status: 'initializing', lastError: null }
    return { status: state.status, lastError: state.lastError }
  }

  async function waitUntilHealthy(): Promise<void> {
    get()
    const deadline = Date.now() + WORKER_STARTUP_TIMEOUT_MS
    for (;;) {
      const { status, lastError } = getHealthStatus()
      if (status === 'healthy') return
      if (status === 'error' || status === 'crashed') {
        throw new Error(lastError ?? `${options.workerName} worker unavailable`)
      }
      if (Date.now() >= deadline) {
        throw new Error(`${options.workerName} worker did not become ready in time`)
      }
      await new Promise((resolve) => setTimeout(resolve, WORKER_STARTUP_POLL_MS))
    }
  }

  function get(): Remote<TService> {
    if (!state) {
      const worker = options.createWorker()

      worker.addEventListener('error', (event) => {
        const message = formatWorkerError(event)
        if (options.logWorkerError) {
          options.logWorkerError(message, event)
        } else {
          console.error(`[${options.logPrefix}] Worker error:`, message, event)
        }
        setStatus('crashed', message)
      })

      worker.addEventListener('messageerror', (event) => {
        console.error(`[${options.logPrefix}] Worker message error:`, event)
        setStatus('crashed', 'Message deserialization failed')
      })

      const proxy = wrap<TService>(worker)

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

  function terminate(): void {
    if (state) {
      stopHealthPolling()
      state.worker.terminate()
      state = null
    }
    options.onTerminate?.()
  }

  function onHealthChange(
    listener: (status: RailWorkerHealthStatus, error: string | null) => void,
  ): () => void {
    statusListeners.add(listener)
    return () => statusListeners.delete(listener)
  }

  return {
    waitUntilHealthy,
    getIfExists: () => state?.proxy ?? null,
    get,
    terminate,
    getHealthStatus,
    onHealthChange,
  }
}
