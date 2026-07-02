import type { NetworkMode } from '@/stores/walletStore'

export type ArkadeRailScope = {
  walletId: number
  networkMode: NetworkMode
  connectionId: string
}

export function arkadeRailScopeKey(
  scope: Pick<ArkadeRailScope, 'walletId' | 'networkMode' | 'connectionId'>,
): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.connectionId}`
}
