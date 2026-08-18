import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  UnilateralExitLifecyclePhase,
  persistedUnilateralExitJobExists,
  type PersistedUnilateralExitJob,
  type UnilateralExitLifecycleSnapshot,
  type UnilateralExitWalletScope,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import type { NetworkMode } from '@/stores/walletStore'
import { getCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'

export function buildUnilateralExitWalletScope(
  walletId: number,
  networkMode: NetworkMode,
  connectionId: string,
): UnilateralExitWalletScope | null {
  if (!isArkadeSupportedNetworkMode(networkMode)) {
    return null
  }
  return { walletId, networkMode, connectionId }
}

export function resolveActiveUnilateralExitWalletScope(): UnilateralExitWalletScope | null {
  const walletState = useWalletStore.getState()
  if (
    walletState.activeWalletId == null ||
    walletState.activeArkadeConnectionId == null
  ) {
    return null
  }
  return buildUnilateralExitWalletScope(
    walletState.activeWalletId,
    getCommittedNetworkMode(),
    walletState.activeArkadeConnectionId,
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
