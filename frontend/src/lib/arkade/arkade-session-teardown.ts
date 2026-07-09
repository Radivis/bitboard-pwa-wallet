import { clearArkadeDashboardStore } from '@/lib/arkade/arkade-persistence-store-sync'
import { removeArkadeDashboardSyncQueries } from '@/lib/arkade/arkade-dashboard-sync'
import { removeArkadeDashboardQueries } from '@/lib/arkade/arkade-query-keys'
import { forceResetArkadeLoadLifecycleForTeardown } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { forceResetArkadeSaveLifecycleForTeardown } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { forceResetArkadeSyncLifecycleForTeardown } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { terminateArkadeWorker } from '@/workers/arkade-factory'

/**
 * Full Arkade session teardown after optional flush/close work.
 *
 * Callers: `closeArkadeSession`, `abortArkadeSessionForNetworkSwitch` in
 * `arkade-session-service.ts`. Load failures that should surface `load-error` only
 * terminate the worker and clear the dashboard store — they must not call this helper.
 */
export function tearDownArkadeWorkerAndClientState(): void {
  terminateArkadeWorker()
  clearArkadeDashboardStore()
  removeArkadeDashboardQueries()
  removeArkadeDashboardSyncQueries()
  forceResetArkadeLoadLifecycleForTeardown()
  forceResetArkadeSyncLifecycleForTeardown()
  forceResetArkadeSaveLifecycleForTeardown()
}
