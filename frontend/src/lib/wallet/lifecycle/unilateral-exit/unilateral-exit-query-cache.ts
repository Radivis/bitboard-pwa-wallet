import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeBalanceQueryKey,
  arkadeUnilateralExitProgressQueryKey,
  arkadeUnilateralExitTopologyScopeKey,
} from '@/lib/arkade/arkade-query-keys'
import type { ArkadeWalletScope } from '@/lib/arkade/arkade-session-scope'
import type { ArkadeUnilateralExitProgress, ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

export async function writeUnilateralExitProgressQueryCache(
  scope: ArkadeWalletScope,
  outpoints: ArkadeVtxoOutpoint[],
  progress: ArkadeUnilateralExitProgress,
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    return
  }
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  appQueryClient.setQueryData(
    arkadeUnilateralExitProgressQueryKey(
      scope.walletId,
      scope.networkMode,
      scope.connectionId,
      sortArkadeVtxoOutpoints(outpoints),
    ),
    progress,
  )
}

export async function invalidateUnilateralExitQueries(
  scope: ArkadeWalletScope,
  outpoints: ArkadeVtxoOutpoint[],
  progress?: ArkadeUnilateralExitProgress,
): Promise<void> {
  if (!isArkadeSupportedNetworkMode(scope.networkMode)) {
    return
  }
  const { appQueryClient } = await import('@/lib/shared/app-query-client')
  if (progress != null) {
    await writeUnilateralExitProgressQueryCache(scope, outpoints, progress)
  }
  await appQueryClient.invalidateQueries({
    queryKey: arkadeBalanceQueryKey(scope.walletId, scope.networkMode, scope.connectionId),
  })
  await appQueryClient.invalidateQueries({
    queryKey: arkadeUnilateralExitTopologyScopeKey(
      scope.walletId,
      scope.networkMode,
      scope.connectionId,
    ),
  })
}
