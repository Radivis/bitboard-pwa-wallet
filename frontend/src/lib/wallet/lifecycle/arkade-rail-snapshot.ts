import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { getArkadeSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import type {
  LoadLifecyclePhase,
  SaveLifecyclePhase,
  SyncLifecyclePhase,
} from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type ArkadeRailSnapshot = {
  loadPhase: LoadLifecyclePhase
  syncPhase: SyncLifecyclePhase
  savePhase: SaveLifecyclePhase
}

export function getArkadeRailSnapshot(): ArkadeRailSnapshot {
  const loadSnapshot = getArkadeLoadLifecycleSnapshot()
  const { loadPhase } = loadSnapshot

  if (loadPhase === 'not-configured') {
    return {
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    }
  }
  if (loadPhase === 'load-error') {
    return {
      loadPhase: 'load-error',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    }
  }

  const syncSnapshot = getArkadeSyncLifecycleSnapshot()
  const saveSnapshot = getArkadeSaveLifecycleSnapshot()

  return {
    loadPhase,
    syncPhase: syncSnapshot.syncPhase,
    savePhase: saveSnapshot.savePhase,
  }
}
