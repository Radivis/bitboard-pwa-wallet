import { useSyncExternalStore } from 'react'

/** Dashboard activity rows per page by viewport tier (aligned with Tailwind `md` / `lg`). */
export const DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT = {
  small: 5,
  medium: 8,
  large: 10,
} as const

/** Tailwind default `md` breakpoint (48rem). */
export const DASHBOARD_ACTIVITY_MD_MIN_WIDTH_PX = 768

/** Tailwind default `lg` breakpoint (64rem). */
export const DASHBOARD_ACTIVITY_LG_MIN_WIDTH_PX = 1024

export function resolveDashboardActivityPageSize(viewportWidthPx: number): number {
  if (viewportWidthPx >= DASHBOARD_ACTIVITY_LG_MIN_WIDTH_PX) {
    return DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.large
  }
  if (viewportWidthPx >= DASHBOARD_ACTIVITY_MD_MIN_WIDTH_PX) {
    return DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.medium
  }
  return DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.small
}

function readDashboardActivityPageSize(): number {
  if (typeof window === 'undefined') {
    return DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.large
  }
  return resolveDashboardActivityPageSize(window.innerWidth)
}

function subscribeViewportWidth(onStoreChange: () => void): () => void {
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

/** Responsive page size for dashboard on-chain / Lightning activity lists. */
export function useDashboardActivityPageSize(): number {
  return useSyncExternalStore(
    subscribeViewportWidth,
    readDashboardActivityPageSize,
    () => DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.large,
  )
}
