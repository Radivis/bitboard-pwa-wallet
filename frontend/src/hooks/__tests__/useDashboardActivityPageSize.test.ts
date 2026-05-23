import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT,
  resolveDashboardActivityPageSize,
} from '@/hooks/useDashboardActivityPageSize'

describe('resolveDashboardActivityPageSize', () => {
  it('returns small-page size below md breakpoint', () => {
    expect(resolveDashboardActivityPageSize(767)).toBe(
      DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.small,
    )
  })

  it('returns medium-page size from md up to below lg', () => {
    expect(resolveDashboardActivityPageSize(768)).toBe(
      DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.medium,
    )
    expect(resolveDashboardActivityPageSize(1023)).toBe(
      DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.medium,
    )
  })

  it('returns large-page size at lg breakpoint and above', () => {
    expect(resolveDashboardActivityPageSize(1024)).toBe(
      DASHBOARD_ACTIVITY_PAGE_SIZE_BY_VIEWPORT.large,
    )
  })
})
