import { ensureMigrated } from '@/db/database'
import { getArkadeSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { appQueryClient } from '@/lib/shared/app-query-client'
import { loadActiveArkadeConnectionForNetwork } from '@/lib/arkade/arkade-operator-connections'
import {
  isArkadeSupportedNetworkMode,
  type ArkadeSupportedNetworkMode,
} from '@/lib/arkade/arkade-endpoints'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'
import {
  selectCommittedAccountId,
  selectCommittedAddressType,
  useWalletStore,
} from '@/stores/walletStore'
export const ARKADE_DASHBOARD_QUERY_KEY = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  'arkade',
  'dashboard',
] as const

export function arkadeOperatorSyncMetadataQueryKey(
  connectionId: string,
): readonly ['wallet_db', 'arkade', 'dashboard', 'operator', string] {
  return [...ARKADE_DASHBOARD_QUERY_KEY, 'operator', connectionId]
}

export interface ArkadeOperatorSyncMetadataResult {
  isStaleArkade: boolean
  lastSuccessfulOperatorSyncAt?: string
}

function activeArkadeDashboardContext():
  | {
      networkMode: ArkadeSupportedNetworkMode
      walletId: number
      connectionId: string
    }
  | null {
  const walletState = useWalletStore.getState()
  const { activeWalletId, walletStatus, networkMode, activeArkadeConnectionId } =
    walletState
  if (
    activeWalletId == null ||
    activeArkadeConnectionId == null ||
    !isArkadeSupportedNetworkMode(networkMode) ||
    walletStatus === 'locked' ||
    walletStatus === 'none'
  ) {
    return null
  }
  return {
    networkMode,
    walletId: activeWalletId,
    connectionId: activeArkadeConnectionId,
  }
}

export async function resolveArkadeOperatorSyncMetadata(): Promise<
  ArkadeOperatorSyncMetadataResult
> {
  const walletState = useWalletStore.getState()
  const syncPhase = getArkadeSyncLifecycleSnapshot().syncPhase
  const savePhase = getArkadeSaveLifecycleSnapshot().savePhase
  const operatorWorkInProgress = syncPhase === 'syncing' || savePhase === 'saving'

  const context = activeArkadeDashboardContext()
  if (context == null) {
    return { isStaleArkade: false }
  }

  await ensureMigrated()
  const connection = await loadActiveArkadeConnectionForNetwork({
    walletId: context.walletId,
    networkMode: context.networkMode,
  })
  const lastSuccessfulOperatorSyncAt = connection?.lastSuccessfulOperatorSyncAt

  const isStaleArkade =
    !operatorWorkInProgress &&
    walletState.lastOperatorSyncTime == null &&
    lastSuccessfulOperatorSyncAt != null

  return {
    isStaleArkade,
    ...(lastSuccessfulOperatorSyncAt != null
      ? { lastSuccessfulOperatorSyncAt }
      : {}),
  }
}

export function invalidateArkadeDashboardQueries(): void {
  void appQueryClient.invalidateQueries({ queryKey: ARKADE_DASHBOARD_QUERY_KEY })
}

export function removeArkadeDashboardSyncQueries(): void {
  appQueryClient.removeQueries({ queryKey: ARKADE_DASHBOARD_QUERY_KEY })
}

/** @internal Used by stale metadata hook — validates committed descriptor context exists. */
export function hasActiveDescriptorWalletContext(): boolean {
  const walletState = useWalletStore.getState()
  if (walletState.networkMode === 'lab' || walletState.activeWalletId == null) {
    return false
  }
  void selectCommittedAddressType(walletState)
  void selectCommittedAccountId(walletState)
  return true
}
