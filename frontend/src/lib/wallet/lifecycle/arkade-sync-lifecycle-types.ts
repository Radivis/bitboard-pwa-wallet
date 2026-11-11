import type { NetworkMode } from '@/stores/walletStore'
import type { SyncLifecyclePhase } from '@/lib/wallet/lifecycle/rail-lifecycle-types'
import type { ArkadeRailScope } from '@/lib/wallet/lifecycle/arkade-rail-types'
import type { ArkadePendingBatchIntent } from '@/workers/arkade-api'

export type ArkadeSyncKind = 'postLoad' | 'dashboardPoll' | 'manual' | 'signerMigration'

export type ArkadeSyncLifecycleSnapshot = {
  syncPhase: SyncLifecyclePhase
  railScope: ArkadeRailScope | null
  errorMessage: string | null
  /** Active non-blocking sync warnings. Each entry is cleared on its own. */
  warningMessages: string[]
}

export type ArkadeSyncParams = {
  walletId: number
  networkMode: NetworkMode
  arkadeAccountId: string
  syncKind: ArkadeSyncKind
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
  /** When false, sync/save errors do not throw (background post-load). */
  throwOnError?: boolean
  onIntentRegistered?: (intent: ArkadePendingBatchIntent) => void
}

export type ArkadeSyncThenSaveParams = ArkadeSyncParams

export type ArkadePostLoadSyncParams = {
  walletId: number
  networkMode: NetworkMode
  arkadeAccountId: string
  onSyncError?: (err: unknown) => void
  awaitCompletion?: boolean
}
