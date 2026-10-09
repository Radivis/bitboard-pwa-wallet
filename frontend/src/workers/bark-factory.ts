import type { Remote } from 'comlink'
import { resetBarkPersistenceChannel } from '@/workers/bark-persistence-channel'
import { resetBarkWorkerSecretsChannel } from '@/workers/secrets-channel'
import type { BarkService } from '@/workers/bark-api'
import {
  createRailWorkerController,
  type RailWorkerHealthStatus,
} from '@/workers/rail-worker-controller'

export type BarkWorkerHealthStatus = RailWorkerHealthStatus

const barkWorker = createRailWorkerController<BarkService>({
  logPrefix: 'bark-factory',
  workerName: 'Bark',
  createWorker: () =>
    new Worker(new URL('./bark.worker.ts', import.meta.url), { type: 'module' }),
  onTerminate: () => {
    resetBarkPersistenceChannel()
    resetBarkWorkerSecretsChannel()
  },
})

export function waitForBarkWorkerHealthy(): Promise<void> {
  return barkWorker.waitUntilHealthy()
}

export function getBarkWorkerIfExists(): Remote<BarkService> | null {
  return barkWorker.getIfExists()
}

export function getBarkWorker(): Remote<BarkService> {
  return barkWorker.get()
}

export function terminateBarkWorker(): void {
  barkWorker.terminate()
}

export function getBarkWorkerHealthStatus(): {
  status: BarkWorkerHealthStatus
  lastError: string | null
} {
  return barkWorker.getHealthStatus()
}

export function onBarkWorkerHealthChange(
  listener: (status: BarkWorkerHealthStatus, error: string | null) => void,
): () => void {
  return barkWorker.onHealthChange(listener)
}
