import { describe, expect, it } from 'vitest'
import {
  BOTTOM_NAV_SWIPE_DISTANCE_PX,
  BOTTOM_NAV_SWIPE_ZONE_EXTRA_PX,
  bottomNavSwipeIntent,
} from '@/components/design/bottom-nav-swipe'

const viewportHeight = 800
const barHeight = 68
const zoneTop = viewportHeight - (barHeight + BOTTOM_NAV_SWIPE_ZONE_EXTRA_PX)

describe('bottomNavSwipeIntent', () => {
  it('hides when a downward swipe starts inside the bar plus 50px', () => {
    expect(
      bottomNavSwipeIntent({
        startX: 100,
        startY: zoneTop + 10,
        endX: 110,
        endY: zoneTop + 10 + BOTTOM_NAV_SWIPE_DISTANCE_PX,
        viewportHeight,
        barHeight,
      }),
    ).toBe('hide')
  })

  it('shows when an upward swipe starts inside that zone', () => {
    expect(
      bottomNavSwipeIntent({
        startX: 100,
        startY: viewportHeight - 20,
        endX: 90,
        endY: viewportHeight - 20 - BOTTOM_NAV_SWIPE_DISTANCE_PX,
        viewportHeight,
        barHeight,
      }),
    ).toBe('show')
  })

  it('ignores a swipe that starts above the zone', () => {
    expect(
      bottomNavSwipeIntent({
        startX: 100,
        startY: zoneTop - 1,
        endX: 100,
        endY: zoneTop - 1 + BOTTOM_NAV_SWIPE_DISTANCE_PX + 20,
        viewportHeight,
        barHeight,
      }),
    ).toBeNull()
  })

  it('ignores a short drag and a horizontal swipe', () => {
    expect(
      bottomNavSwipeIntent({
        startX: 100,
        startY: viewportHeight - 10,
        endX: 100,
        endY: viewportHeight - 10 + BOTTOM_NAV_SWIPE_DISTANCE_PX - 1,
        viewportHeight,
        barHeight,
      }),
    ).toBeNull()
    expect(
      bottomNavSwipeIntent({
        startX: 40,
        startY: viewportHeight - 10,
        endX: 40 + BOTTOM_NAV_SWIPE_DISTANCE_PX + 10,
        endY: viewportHeight,
        viewportHeight,
        barHeight,
      }),
    ).toBeNull()
  })
})
