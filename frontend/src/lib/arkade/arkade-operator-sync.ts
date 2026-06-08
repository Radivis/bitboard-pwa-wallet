import { toast } from 'sonner'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { saveSdkPersistenceJsonForConnection } from '@/lib/arkade/arkade-sdk-persistence'
import { refreshArkadeStoreFromLoadedWasm } from '@/lib/arkade/arkade-persistence-store-sync'
import { awaitArkadeSessionReady } from '@/lib/arkade/arkade-session-service'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { errorMessage } from '@/lib/shared/utils'
import { invalidateArkadeDashboardQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

export async function syncArkadeWithOperator(params: {
  password: string
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}): Promise<void> {
  if (!isArkadeActiveForNetworkMode(params.networkMode)) {
    return
  }

  await awaitArkadeSessionReady()
  const worker = getArkadeWorker()
  await worker.syncWithOperator()
  await refreshArkadeStoreFromLoadedWasm()

  const now = new Date().toISOString()
  const exportedJson = await worker.exportSdkPersistenceJson()
  await saveSdkPersistenceJsonForConnection({
    password: params.password,
    walletId: params.walletId,
    connectionId: params.connectionId,
    sdkPersistenceJson: exportedJson,
    lastSuccessfulOperatorSyncAt: now,
  })
  useWalletStore.getState().setLastOperatorSyncTime(new Date())
  invalidateArkadeDashboardQueries()
}

export async function runArkadeOperatorSyncAndPersist(params: {
  password: string
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  onError?: (err: unknown) => void
}): Promise<void> {
  try {
    await syncArkadeWithOperator(params)
  } catch (err) {
    params.onError?.(err)
    toast.error(`Arkade operator sync failed: ${errorMessage(err)}`)
  }
}
