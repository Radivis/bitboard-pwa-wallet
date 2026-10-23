import type { Remote } from 'comlink'
import type { ArkadeService } from '@/workers/arkade-api'
import { resetArkadePersistenceChannel } from '@/workers/arkade-persistence-channel'
import { resetArkadeWorkerSecretsChannel } from '@/workers/secrets-channel'
import {
  createRailWorkerController,
  type RailWorkerHealthStatus,
} from '@/workers/rail-worker-controller'

export type ArkadeWorkerHealthStatus = RailWorkerHealthStatus

const arkadeWorker = createRailWorkerController<ArkadeService>({
  logPrefix: 'arkade-factory',
  workerName: 'Arkade',
  createWorker: () =>
    new Worker(new URL('./arkade.worker.ts', import.meta.url), { type: 'module' }),
  onTerminate: () => {
    resetArkadePersistenceChannel()
    resetArkadeWorkerSecretsChannel()
  },
})

export function waitForArkadeWorkerHealthy(): Promise<void> {
  return arkadeWorker.waitUntilHealthy()
}

export function getArkadeWorkerIfExists(): Remote<ArkadeService> | null {
  return arkadeWorker.getIfExists()
}

export function getArkadeWorker(): Remote<ArkadeService> {
  return arkadeWorker.get()
}

export function terminateArkadeWorker(): void {
  arkadeWorker.terminate()
}

export function getArkadeWorkerHealthStatus(): {
  status: ArkadeWorkerHealthStatus
  lastError: string | null
} {
  return arkadeWorker.getHealthStatus()
}

export function onArkadeWorkerHealthChange(
  listener: (status: ArkadeWorkerHealthStatus, error: string | null) => void,
): () => void {
  return arkadeWorker.onHealthChange(listener)
}
