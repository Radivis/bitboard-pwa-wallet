import type { LockLifecyclePhase } from '@/lib/wallet/lifecycle/lock-lifecycle-types'
import { syncArkadeLoadLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { syncArkadeSaveLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { syncArkadeSyncLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { syncLightningLoadLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import { syncLightningSaveLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { syncLightningSyncLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { syncOnchainLoadLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator'
import { syncOnchainSaveLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/onchain-save-lifecycle-orchestrator'
import { syncOnchainSyncLifecycleWithLockPhase } from '@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator'

/** Resets all rail load/sync/save lifecycles in response to lock phase transitions. */
export function syncAllRailLifecyclesWithLockPhase(lockPhase: LockLifecyclePhase): void {
  syncOnchainLoadLifecycleWithLockPhase(lockPhase)
  syncOnchainSyncLifecycleWithLockPhase(lockPhase)
  syncOnchainSaveLifecycleWithLockPhase(lockPhase)
  syncArkadeLoadLifecycleWithLockPhase(lockPhase)
  syncArkadeSyncLifecycleWithLockPhase(lockPhase)
  syncArkadeSaveLifecycleWithLockPhase(lockPhase)
  syncLightningLoadLifecycleWithLockPhase(lockPhase)
  syncLightningSyncLifecycleWithLockPhase(lockPhase)
  syncLightningSaveLifecycleWithLockPhase(lockPhase)
}
