import type { Remote } from 'comlink'
import type { CryptoService } from './crypto-api'
import {
  createRailWorkerController,
  type RailWorkerHealthStatus,
} from '@/workers/rail-worker-controller'

export type WorkerHealthStatus = RailWorkerHealthStatus

function cryptoWorkerErrorMessage(event: ErrorEvent): string {
  return (
    event.message ||
    (event.error instanceof Error
      ? event.error.message
      : event.error != null
        ? String(event.error)
        : 'Unknown worker error')
  )
}

const cryptoWorker = createRailWorkerController<CryptoService>({
  logPrefix: 'crypto-factory',
  workerName: 'Crypto',
  createWorker: () =>
    new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' }),
  formatWorkerError: cryptoWorkerErrorMessage,
  logWorkerError: (message, event) => {
    console.error('[crypto-factory] Worker error:', message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    })
  },
})

export function waitForCryptoWorkerHealthy(): Promise<void> {
  return cryptoWorker.waitUntilHealthy()
}

export function getCryptoWorker(): Remote<CryptoService> {
  return cryptoWorker.get()
}

export function terminateCryptoWorker(): void {
  cryptoWorker.terminate()
}

export function getWorkerHealthStatus(): {
  status: WorkerHealthStatus
  lastError: string | null
} {
  return cryptoWorker.getHealthStatus()
}

export function onWorkerHealthChange(
  listener: (status: WorkerHealthStatus, error: string | null) => void,
): () => void {
  return cryptoWorker.onHealthChange(listener)
}
