import type { NwcSnapshotPatch } from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import type { NetworkMode } from '@/stores/walletStore'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { LightningRailScope } from '@/lib/wallet/lifecycle/lightning-rail-types'

export type LightningSyncKind = 'postLoad' | 'manual'

export type ConnectionSyncTrackerStatus = 'idle' | 'syncing' | 'ok' | 'error'

export type LightningSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  railScope: LightningRailScope | null
}

export type LightningSyncThenSaveParams = {
  walletId: number
  networkMode: NetworkMode
  syncKind: LightningSyncKind
  syncWork: () => Promise<NwcSnapshotPatch[]>
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
  throwOnError?: boolean
}

export type LightningPostLoadSyncParams = {
  walletId: number
  networkMode: NetworkMode
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
}
