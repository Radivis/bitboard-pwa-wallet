import { describe, expect, it } from 'vitest'
import { arkadeDashboardWalletDataQueryOptions } from '@/lib/arkade/arkade-dashboard-query-options'
import { ARKADE_DASHBOARD_STALE_MS } from '@/lib/arkade/arkade-dashboard-query-timings'

describe('arkade dashboard query options', () => {
  it('DASH-ARK-40 refetches wallet data on mount and window focus', () => {
    expect(arkadeDashboardWalletDataQueryOptions.refetchOnMount).toBe('always')
    expect(arkadeDashboardWalletDataQueryOptions.refetchOnWindowFocus).toBe(true)
  })

  it('DASH-ARK-40 does not set a static refetchInterval (periodic sync supplies it per hook)', () => {
    expect(arkadeDashboardWalletDataQueryOptions).not.toHaveProperty('refetchInterval')
    expect(arkadeDashboardWalletDataQueryOptions.staleTime).toBe(ARKADE_DASHBOARD_STALE_MS)
  })
})
