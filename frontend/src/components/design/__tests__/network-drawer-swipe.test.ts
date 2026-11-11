import { describe, expect, it } from 'vitest'
import {
  NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX,
  networkDrawerSwipeMode,
} from '@/components/design/network-drawer-swipe'

const headerBottom = 56

describe('networkDrawerSwipeMode', () => {
  it('opens from a swipe that starts on the top bar', () => {
    expect(
      networkDrawerSwipeMode({
        open: false,
        startY: 20,
        headerBottom,
        startedOnPanel: false,
      }),
    ).toBe('open')
  })

  it('opens from a swipe that starts within 50px below the top bar', () => {
    expect(
      networkDrawerSwipeMode({
        open: false,
        startY: headerBottom + NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX,
        headerBottom,
        startedOnPanel: false,
      }),
    ).toBe('open')
  })

  it('ignores a swipe that starts further down the page', () => {
    expect(
      networkDrawerSwipeMode({
        open: false,
        startY: headerBottom + NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX + 1,
        headerBottom,
        startedOnPanel: false,
      }),
    ).toBeNull()
  })

  it('closes only from a swipe that starts on the open panel', () => {
    expect(
      networkDrawerSwipeMode({
        open: true,
        startY: 200,
        headerBottom,
        startedOnPanel: true,
      }),
    ).toBe('close')
    expect(
      networkDrawerSwipeMode({
        open: true,
        startY: 20,
        headerBottom,
        startedOnPanel: false,
      }),
    ).toBeNull()
  })
})
