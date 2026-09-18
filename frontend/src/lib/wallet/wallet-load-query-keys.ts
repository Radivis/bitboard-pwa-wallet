import type { NetworkMode, AddressType } from '@/stores/walletStore'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

export type ActiveWalletLoadQueryKeyInput = {
  activeWalletId: number | null
  networkMode: NetworkMode
  addressType: AddressType
  accountId: number
  lockUnlockInProgress: boolean
}

/** Segment after `wallet_db` for active descriptor wallet bootstrap queries. */
export const ACTIVE_WALLET_LOAD_QUERY_SEGMENT = 'active-wallet-descriptor-wallet-load' as const

/** Prefix for `removeQueries` / `useIsFetching` on bootstrap load queries. */
export const activeWalletLoadQueryKeyPrefix = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  ACTIVE_WALLET_LOAD_QUERY_SEGMENT,
] as const

/** Segment after `wallet_db` for the secrets-session probe that gates bootstrap. */
export const WALLET_SECRETS_SESSION_PROBE_QUERY_SEGMENT =
  'wallet-secrets-session-active-probe' as const

/** Prefix for invalidating the secrets-session probe after near-zero restore. */
export const walletSecretsSessionProbeQueryKeyPrefix = [
  ...WALLET_DB_QUERY_KEY_ROOT,
  WALLET_SECRETS_SESSION_PROBE_QUERY_SEGMENT,
] as const

/**
 * TanStack Query key for bootstrapping WASM from session + persisted descriptor wallet triple.
 */
export function activeWalletLoadQueryKey(input: ActiveWalletLoadQueryKeyInput) {
  return [
    ...WALLET_DB_QUERY_KEY_ROOT,
    ACTIVE_WALLET_LOAD_QUERY_SEGMENT,
    input.activeWalletId ?? 0,
    input.networkMode,
    input.addressType,
    input.accountId,
    input.lockUnlockInProgress,
  ] as const
}
