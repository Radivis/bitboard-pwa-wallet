import { wrap, type Remote } from 'comlink'
import type { ArkadeService } from '@/workers/arkade-api'
import { resetArkadePersistenceChannel } from '@/workers/arkade-persistence-channel'
import { setArkadeSdkPersistenceBridge } from '@/lib/arkade/storage/arkade-sdk-persistence-flush'

let worker: Worker | null = null
let arkadeWorkerProxy: Remote<ArkadeService> | null = null

export function getArkadeWorker(): Remote<ArkadeService> {
  if (!worker || !arkadeWorkerProxy) {
    worker = new Worker(new URL('./arkade.worker.ts', import.meta.url), {
      type: 'module',
    })
    arkadeWorkerProxy = wrap<ArkadeService>(worker)
  }
  return arkadeWorkerProxy
}

export function terminateArkadeWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    arkadeWorkerProxy = null
  }
  setArkadeSdkPersistenceBridge(null)
  resetArkadePersistenceChannel()
}
