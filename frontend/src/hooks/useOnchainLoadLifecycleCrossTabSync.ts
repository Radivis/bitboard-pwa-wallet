import { useEffect } from 'react'
import { applyOnchainLoadLifecycleSnapshotFromOtherTab } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { subscribeOnchainLoadLifecycleFromOtherTabs } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-cross-tab-sync'

/**
 * Mirrors on-chain load lifecycle snapshots from other tabs so UI/E2E readiness stays aligned
 * when one tab unlocks or locks the wallet.
 */
export function useOnchainLoadLifecycleCrossTabSync(): void {
  useEffect(() => {
    return subscribeOnchainLoadLifecycleFromOtherTabs(
      applyOnchainLoadLifecycleSnapshotFromOtherTab,
    )
  }, [])
}
