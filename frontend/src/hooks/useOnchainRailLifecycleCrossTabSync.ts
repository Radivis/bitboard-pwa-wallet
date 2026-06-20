import { useEffect } from 'react'
import {
  applyOnchainRailSnapshotFromOtherTab,
  subscribeOnchainRailLifecycleFromOtherTabs,
} from '@/lib/wallet/lifecycle/onchain-rail-lifecycle-cross-tab-sync'

/**
 * Mirrors on-chain rail lifecycle snapshots from other tabs when the same descriptor
 * wallet is loaded in WASM in both tabs.
 */
export function useOnchainRailLifecycleCrossTabSync(): void {
  useEffect(() => {
    return subscribeOnchainRailLifecycleFromOtherTabs(applyOnchainRailSnapshotFromOtherTab)
  }, [])
}
