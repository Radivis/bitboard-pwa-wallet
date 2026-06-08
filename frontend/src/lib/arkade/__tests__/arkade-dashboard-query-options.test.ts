import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  arkadeDashboardWalletDataQueryOptions,
  arkadeDashboardWalletDataRefetchInterval,
} from '@/lib/arkade/arkade-dashboard-query-options'
import { ARKADE_DASHBOARD_REFETCH_MS } from '@/lib/arkade/arkade-dashboard-query-timings'

describe('arkade dashboard query options', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DASH-ARK-40 refetches wallet data on mount and window focus', () => {
    expect(arkadeDashboardWalletDataQueryOptions.refetchOnMount).toBe('always')
    expect(arkadeDashboardWalletDataQueryOptions.refetchOnWindowFocus).toBe(true)
  })

  it('DASH-ARK-40 polls wallet data only while the document is visible', () => {
    vi.stubGlobal('document', { visibilityState: 'visible' })
    expect(arkadeDashboardWalletDataRefetchInterval()).toBe(ARKADE_DASHBOARD_REFETCH_MS)

    vi.stubGlobal('document', { visibilityState: 'hidden' })
    expect(arkadeDashboardWalletDataRefetchInterval()).toBe(false)
  })
})
