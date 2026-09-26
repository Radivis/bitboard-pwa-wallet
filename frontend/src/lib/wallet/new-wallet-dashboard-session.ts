import { removeArkadeDashboardSyncQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import { reportArkadeSessionOpenError } from '@/lib/arkade/arkade-session-open-error-toast'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { detachArkadeLoadSnapshotIfDifferentWallet, orchestrateArkadeLoad } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { detachArkadeSyncSnapshotIfDifferentWallet } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { detachOnchainSyncSnapshotIfDifferentWallet } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'
import { removeOnchainDashboardQueries } from '@/lib/wallet/onchain-dashboard-sync'
import type { NetworkMode } from '@/stores/walletStore'

/**
 * Drop dashboard snapshots and caches that still belong to the wallet being left.
 * The in-flight sync for that wallet must not paint its balance onto the new one.
 */
export function releasePreviousWalletDashboardSession(nextWalletId: number): void {
  detachArkadeLoadSnapshotIfDifferentWallet(nextWalletId)
  detachArkadeSyncSnapshotIfDifferentWallet(nextWalletId)
  detachOnchainSyncSnapshotIfDifferentWallet(nextWalletId)
  removeArkadeDashboardQueries()
  removeArkadeDashboardSyncQueries()
  removeOnchainDashboardQueries()
}

/** Open an Arkade session for the wallet that was just activated. */
export function startArkadeSessionForNewWallet(
  walletId: number,
  networkMode: NetworkMode,
): void {
  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return
  }
  void orchestrateArkadeLoad({ walletId, networkMode }).catch((error: unknown) => {
    reportArkadeSessionOpenError(error)
  })
}
