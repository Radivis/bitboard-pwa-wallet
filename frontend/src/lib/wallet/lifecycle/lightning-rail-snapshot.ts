import { getLightningLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import { getLightningSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { getLightningSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import type {
  LoadLifecyclePhase,
  SaveLifecyclePhase,
  SyncLifecyclePhase,
} from '@/lib/wallet/lifecycle/rail-lifecycle-types'

export type LightningRailSnapshot = {
  loadPhase: LoadLifecyclePhase
  syncPhase: SyncLifecyclePhase
  savePhase: SaveLifecyclePhase
}

export function getLightningRailSnapshot(): LightningRailSnapshot {
  const loadSnapshot = getLightningLoadLifecycleSnapshot()
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

  const syncSnapshot = getLightningSyncLifecycleSnapshot()
  const saveSnapshot = getLightningSaveLifecycleSnapshot()

  return {
    loadPhase,
    syncPhase: syncSnapshot.syncPhase,
    savePhase: saveSnapshot.savePhase,
  }
}
