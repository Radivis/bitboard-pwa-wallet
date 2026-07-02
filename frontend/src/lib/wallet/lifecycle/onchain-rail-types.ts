import type { AddressType, NetworkMode } from '@/stores/walletStore'

export type OnchainRailDescriptorScope = {
  walletId: number
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

export function onchainRailDescriptorScopeKey(scope: OnchainRailDescriptorScope): string {
  return `${scope.walletId}:${scope.networkMode}:${scope.addressType}:${scope.accountId}`
}
