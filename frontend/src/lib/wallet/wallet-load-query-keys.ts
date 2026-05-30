import type { NetworkMode, AddressType } from '@/stores/walletStore'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

export type ActiveWalletLoadQueryKeyInput = {
  activeWalletId: number | null
  sessionPresent: boolean
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/** Segment after `wallet_db` for active descriptor wallet bootstrap queries. */
export const ACTIVE_WALLET_LOAD_QUERY_SEGMENT = 'active-wallet-descriptor-wallet-load' as const

/** Prefix for `removeQueries` / `useIsFetching` on bootstrap load queries. */
export const activeWalletLoadQueryKeyPrefix = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  ACTIVE_WALLET_LOAD_QUERY_SEGMENT,
] as const

/**
 * TanStack Query key for bootstrapping WASM from session + persisted descriptor wallet triple.
 */
export function activeWalletLoadQueryKey(input: ActiveWalletLoadQueryKeyInput) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    ACTIVE_WALLET_LOAD_QUERY_SEGMENT,
    input.activeWalletId ?? 0,
    input.sessionPresent,
    input.networkMode,
    input.addressType,
    input.accountId,
  ] as const
}
