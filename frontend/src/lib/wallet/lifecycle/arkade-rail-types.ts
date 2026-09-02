import type { NetworkMode } from '@/stores/walletStore'

export type ArkadeRailScope = {
  walletId: number
  networkMode: NetworkMode
  arkadeAccountId: string
}

export function arkadeRailScopeKey(
  scope: Pick<ArkadeRailScope, 'walletId' | 'networkMode' | 'arkadeAccountId'>,
): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.arkadeAccountId}`
}
