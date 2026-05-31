import type { InvalidateQueryFilters } from '@tanstack/react-query'
import { WALLET_DB_QUERY_KEY_ROOT } from '@/lib/wallet/wallet-query-key-root'

/**
 * Primary invalidation for TanStack Query caches backed by wallet SQLite or encrypted payloads.
 * All wallet-related query keys must share the `wallet_db` prefix (TanStack prefix matching).
 */
export const WALLET_DB_QUERY_INVALIDATION: InvalidateQueryFilters = {
  queryKey: [...WALLET_DB_QUERY_KEY_ROOT],
}

/**
 * Empty during transition; add entries only for queries not yet under the `wallet_db` prefix.
 */
export const WALLET_RELATED_QUERY_INVALIDATIONS_LEGACY: readonly InvalidateQueryFilters[] =
  []
