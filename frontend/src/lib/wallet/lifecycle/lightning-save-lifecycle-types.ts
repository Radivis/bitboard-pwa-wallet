import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import type { NwcSnapshotPatch } from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import type { NetworkMode } from '@/stores/walletStore'
import type { SaveLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { LightningRailScope } from '@/lib/wallet/lifecycle/lightning-rail-types'

export type LightningSaveKind = 'connections' | 'snapshotPatches'

export type LightningSaveLifecycleSnapshot = {
  savePhase: SaveLifecyclePhase
  errorMessage: string | null
  railScope: LightningRailScope | null
}

export type LightningSaveConnectionsParams = {
  walletId: number
  networkMode: NetworkMode
  connections: ConnectedLightningWallet[]
}

export type LightningSaveSnapshotPatchesParams = {
  walletId: number
  networkMode: NetworkMode
  patches: NwcSnapshotPatch[]
  /**
   * When true, invalidates dashboard history/balance React Query caches after persist.
   * Use for orchestrator-driven sync (manual/postLoad) that does not update those caches.
   * Query-driven fetches should leave this false to avoid save → invalidate → refetch loops.
   */
  refreshDashboardQueriesAfterSave?: boolean
}

export type LightningSaveParams =
  | (LightningSaveConnectionsParams & { saveKind: 'connections' })
  | (LightningSaveSnapshotPatchesParams & { saveKind: 'snapshotPatches' })
