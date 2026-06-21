import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { getLightningSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { getOnchainSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'

/** True when any configured rail has an in-flight operator/network sync. */
export function isAnyRailSyncing(): boolean {
  return (
    getOnchainSyncLifecycleSnapshot().syncPhase === 'syncing' ||
    getArkadeSyncLifecycleSnapshot().syncPhase === 'syncing' ||
    getLightningSyncLifecycleSnapshot().syncPhase === 'syncing'
  )
}
