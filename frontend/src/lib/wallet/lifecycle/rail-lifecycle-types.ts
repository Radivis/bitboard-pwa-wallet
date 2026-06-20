export type LoadLifecyclePhase =
  | 'not-configured'
  | 'loading'
  | 'loaded'
  | 'load-error'

export type SyncLifecyclePhase =
  | 'not-configured'
  | 'not-syncing'
  | 'syncing'
  | 'sync-error'

export type SaveLifecyclePhase =
  | 'not-configured'
  | 'not-saving'
  | 'saving'
  | 'save-error'

export type OnchainRailSnapshot = {
  loadPhase: LoadLifecyclePhase
  syncPhase: SyncLifecyclePhase
  savePhase: SaveLifecyclePhase
}
