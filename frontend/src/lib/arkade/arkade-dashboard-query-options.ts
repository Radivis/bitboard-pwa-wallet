import {
  ARKADE_DASHBOARD_REFETCH_MS,
  ARKADE_DASHBOARD_STALE_MS,
} from '@/lib/arkade/arkade-dashboard-query-timings'

/** Poll only while the tab is visible (matches Lightning dashboard queries). */
export function arkadeDashboardWalletDataRefetchInterval(): number | false {
  if (typeof document === 'undefined') {
    return false
  }
  return document.visibilityState === 'visible' ? ARKADE_DASHBOARD_REFETCH_MS : false
}

/**
 * Shared React Query options for Arkade balance/history on Dashboard and Receive.
 * Incoming VTXOs are discovered in WASM on each fetch; remount after Receive must not
 * serve stale cache from before the payment landed.
 */
export const arkadeDashboardWalletDataQueryOptions = {
  staleTime: ARKADE_DASHBOARD_STALE_MS,
  refetchInterval: arkadeDashboardWalletDataRefetchInterval,
  refetchOnWindowFocus: true,
  refetchOnMount: 'always' as const,
}
