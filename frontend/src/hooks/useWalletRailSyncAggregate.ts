import { useSyncExternalStore } from 'react'
import { subscribeArkadeSyncLifecycle } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { subscribeLightningSyncLifecycle } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { subscribeOnchainSyncLifecycle } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { isAnyRailSyncing } from '@/lib/wallet/lifecycle/wallet-rail-sync-aggregate'
import { createStableSnapshotGetter } from '@/hooks/lifecycle-snapshot-subscription'

function subscribeAnyRailSyncing(onStoreChange: () => void): () => void {
  const unsubscribeOnchain = subscribeOnchainSyncLifecycle(onStoreChange)
  const unsubscribeArkade = subscribeArkadeSyncLifecycle(onStoreChange)
  const unsubscribeLightning = subscribeLightningSyncLifecycle(onStoreChange)
  return () => {
    unsubscribeOnchain()
    unsubscribeArkade()
    unsubscribeLightning()
  }
}

const getStableAnyRailSyncing = createStableSnapshotGetter(
  () => isAnyRailSyncing(),
  (previous, next) => previous === next,
)

export function useAnyRailSyncing(): boolean {
  return useSyncExternalStore(
    subscribeAnyRailSyncing,
    getStableAnyRailSyncing,
    getStableAnyRailSyncing,
  )
}

/** Re-export for components that need snapshot reads without subscribing all rails. */
export { isAnyRailSyncing }
