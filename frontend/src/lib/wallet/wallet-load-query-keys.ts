import type { NetworkMode, AddressType } from '@/stores/walletStore'

export type ActiveWalletLoadQueryKeyInput = {
  activeWalletId: number | null
  sessionPresent: boolean
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/** Root segment for `queryClient.removeQueries` when session clears. */
export const ACTIVE_WALLET_LOAD_QUERY_ROOT = 'active-wallet-sub-wallet-load' as const

const ROOT = ACTIVE_WALLET_LOAD_QUERY_ROOT

/**
 * TanStack Query key for bootstrapping WASM from session + persisted sub-wallet triple.
 */
export function activeWalletLoadQueryKey(
  input: ActiveWalletLoadQueryKeyInput,
): readonly [typeof ROOT, number, boolean, NetworkMode, AddressType, number] {
  return [
    ROOT,
    input.activeWalletId ?? 0,
    input.sessionPresent,
    input.networkMode,
    input.addressType,
    input.accountId,
  ]
}
