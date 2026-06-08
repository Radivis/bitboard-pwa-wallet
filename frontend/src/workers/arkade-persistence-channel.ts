import { proxy } from 'comlink'
import type { ArkadeSdkPersistenceBridge } from '@/lib/arkade/storage/arkade-sdk-persistence-flush'
import { saveSdkPersistenceJsonForConnection } from '@/lib/arkade/arkade-sdk-persistence'

let bridgeReady = false
let bridgePromise: Promise<void> | null = null

const persistenceBridge: ArkadeSdkPersistenceBridge = {
  async persistSdkPersistence(params) {
    await saveSdkPersistenceJsonForConnection({
      password: params.password,
      walletId: params.walletId,
      connectionId: params.connectionId,
      sdkPersistenceJson: params.sdkPersistenceJson,
      lastSuccessfulOperatorSyncAt: params.lastSuccessfulOperatorSyncAt,
    })
  },
}

export function resetArkadePersistenceChannel(): void {
  bridgeReady = false
  bridgePromise = null
}

/**
 * Registers the main-thread persistence bridge on the Arkade worker (Comlink).
 */
export async function ensureArkadePersistenceChannel(): Promise<void> {
  if (bridgeReady) return
  if (bridgePromise) {
    await bridgePromise
    return
  }

  bridgePromise = (async () => {
    const { getArkadeWorker } = await import('@/workers/arkade-factory')
    const worker = getArkadeWorker()
    await worker.setSdkPersistenceBridge(proxy(persistenceBridge))
    bridgeReady = true
  })().finally(() => {
    bridgePromise = null
  })

  await bridgePromise
}

/** @internal Test hook */
export function exposeArkadePersistenceBridgeForTests(): ArkadeSdkPersistenceBridge {
  return persistenceBridge
}
