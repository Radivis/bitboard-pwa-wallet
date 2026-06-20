import type { NetworkMode } from '@/stores/walletStore'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'

export type ArkadeSyncKind = 'postLoad' | 'dashboardPoll' | 'manual'

export type ArkadeSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  railScope: ArkadeRailScope | null
}

export type ArkadeSyncParams = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  syncKind: ArkadeSyncKind
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
  /** When false, sync/save errors do not throw (background post-load). */
  throwOnError?: boolean
}

export type ArkadeSyncThenSaveParams = ArkadeSyncParams

export type ArkadePostLoadSyncParams = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
}
