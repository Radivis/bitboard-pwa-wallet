import type { NetworkMode } from '@/stores/walletStore'

export type LightningRailScope = {
  walletId: number
  networkMode: NetworkMode
}

export function lightningRailScopeKey(
  scope: Pick<LightningRailScope, 'walletId' | 'networkMode'>,
): string {
  return `${scope.walletId}:${scope.networkMode}`
}
