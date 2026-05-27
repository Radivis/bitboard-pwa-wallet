import type { NetworkMode, AddressType } from '@/stores/walletStore'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

export type ActiveWalletLoadQueryKeyInput = {
  activeWalletId: number | null
  sessionPresent: boolean
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
}

/** Segment after `wallet_db` for active sub-wallet bootstrap queries. */
export const ACTIVE_WALLET_LOAD_QUERY_SEGMENT = 'active-wallet-sub-wallet-load' as const

/**
 * @deprecated Prefer {@link activeWalletLoadQueryKeyPrefix} for prefix invalidation/removal.
 * Kept as the segment name only (not a full query key root).
 */
export const ACTIVE_WALLET_LOAD_QUERY_ROOT = ACTIVE_WALLET_LOAD_QUERY_SEGMENT

/** Prefix for `removeQueries` / `useIsFetching` on bootstrap load queries. */
export const activeWalletLoadQueryKeyPrefix = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  ACTIVE_WALLET_LOAD_QUERY_SEGMENT,
] as const

/**
 * TanStack Query key for bootstrapping WASM from session + persisted sub-wallet triple.
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
