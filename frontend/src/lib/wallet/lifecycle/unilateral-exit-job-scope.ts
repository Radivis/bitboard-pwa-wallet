import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import {
  UnilateralExitLifecyclePhase,
  persistedUnilateralExitJobExists,
  type PersistedUnilateralExitJob,
  type UnilateralExitLifecycleSnapshot,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import type { NetworkMode } from '@/stores/walletStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'

export function buildArkadeWalletScope(
  walletId: number,
  networkMode: NetworkMode,
  arkadeAccountId: string,
): ArkadeWalletScope | null {
  if (!isArkadeSupportedNetworkMode(networkMode)) {
    return null
  }
  return { walletId, networkMode, arkadeAccountId }
}

export function resolveActiveArkadeWalletScope(): ArkadeWalletScope | null {
  const walletState = useWalletStore.getState()
  if (
    walletState.activeWalletId == null ||
    walletState.activeArkadeAccountId == null
  ) {
    return null
  }
  return buildArkadeWalletScope(
    walletState.activeWalletId,
    getCommittedNetworkMode(),
    walletState.activeArkadeAccountId,
  )
}

export function resolveUnilateralExitJobOutpoints(params: {
  lifecycleOutpoints: ArkadeVtxoOutpoint[]
  persistedJob?: PersistedUnilateralExitJob
  fallbackOutpoints?: ArkadeVtxoOutpoint[]
}): ArkadeVtxoOutpoint[] {
  const outpoints =
    params.lifecycleOutpoints.length > 0
      ? params.lifecycleOutpoints
      : params.persistedJob != null && params.persistedJob.selectedLeafOutpoints.length > 0
        ? params.persistedJob.selectedLeafOutpoints
        : (params.fallbackOutpoints ?? [])
  return sortArkadeVtxoOutpoints(outpoints)
}

export function isUnilateralExitAutomationJobInactive(
  lifecycle: UnilateralExitLifecycleSnapshot,
  persisted: PersistedUnilateralExitJob,
  jobOutpoints: ArkadeVtxoOutpoint[],
): boolean {
  return (
    lifecycle.phase === UnilateralExitLifecyclePhase.Complete ||
    lifecycle.phase === UnilateralExitLifecyclePhase.Error ||
    lifecycle.phase === UnilateralExitLifecyclePhase.NotConfigured ||
    (!persistedUnilateralExitJobExists(persisted) && jobOutpoints.length === 0)
  )
}
