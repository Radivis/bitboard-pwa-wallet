import { ARKADE_DASHBOARD_STALE_MS } from '@/lib/arkade/arkade-dashboard-query-timings'

/**
 * Shared React Query options for Arkade balance/history on Dashboard and Receive.
 * Incoming VTXOs are discovered in WASM on each fetch; remount after Receive must not
 * serve stale cache from before the payment landed.
 *
 * `refetchInterval` is supplied per-hook via `usePeriodicSyncRefetchInterval('arkade')`.
 */
export const arkadeDashboardWalletDataQueryOptions = {
  staleTime: ARKADE_DASHBOARD_STALE_MS,
  refetchOnWindowFocus: true,
  refetchOnMount: 'always' as const,
}
