import type { InvalidateQueryFilters } from '@tanstack/react-query'
import { walletKeys } from '@/db/query-keys'
import { COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY } from '@/hooks/useCommittedExternalDescriptor'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'
import { LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY } from '@/lib/lightning-connections-hydration'
import { LIGHTNING_DASHBOARD_QUERY_KEY } from '@/lib/lightning-dashboard-sync'

/**
 * Single source of truth for TanStack Query invalidations after wallet DB / related persisted
 * state changes (used with cross-tab `BroadcastChannel` and local invalidation).
 *
 * Follow-up (separate PR): migrate wallet-related `queryKey` values to share a common prefix
 * such as `['wallet_db', ...]` across all `useQuery` call sites, so one
 * `invalidateQueries({ queryKey: ['wallet_db'] })` (with prefix matching) can replace
 * maintaining this list. Deferred because it touches many hooks and query modules.
 */
export const WALLET_RELATED_QUERY_INVALIDATIONS: readonly InvalidateQueryFilters[] =
  [
    { queryKey: walletKeys.all },
    { queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] },
    { queryKey: [...LIGHTNING_CONNECTIONS_HYDRATION_QUERY_KEY] },
    { queryKey: [...LIGHTNING_DASHBOARD_QUERY_KEY] },
    { queryKey: [COMMITTED_EXTERNAL_DESCRIPTOR_QUERY_KEY] },
    { queryKey: ['customEsploraUrl'] },
  ]
