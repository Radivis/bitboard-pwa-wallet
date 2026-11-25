import { useEffect, useRef, type RefObject } from 'react'

/** Extra space above the bar that still counts as "close to" the bottom nav. */
export const BOTTOM_NAV_SWIPE_ZONE_EXTRA_PX = 50

/** Minimum travel so a tap on a nav item does not hide the bar. */
export const BOTTOM_NAV_SWIPE_DISTANCE_PX = 48

export type BottomNavSwipeIntent = 'hide' | 'show'

export function bottomNavSwipeIntent({
  startX,
  startY,
  endX,
  endY,
  viewportHeight,
  barHeight,
}: {
  startX: number
  startY: number
  endX: number
  endY: number
  viewportHeight: number
  barHeight: number
}): BottomNavSwipeIntent | null {
  if (barHeight <= 0) return null
  const zoneTop = viewportHeight - (barHeight + BOTTOM_NAV_SWIPE_ZONE_EXTRA_PX)
  if (startY < zoneTop) return null

  const deltaX = endX - startX
  const deltaY = endY - startY
  const verticalSwipe =
    Math.abs(deltaY) >= BOTTOM_NAV_SWIPE_DISTANCE_PX && Math.abs(deltaY) > Math.abs(deltaX)
  if (!verticalSwipe) return null
  return deltaY > 0 ? 'hide' : 'show'
}

export function useBottomNavSwipe(
  navRef: RefObject<HTMLElement | null>,
  setHidden: (hidden: boolean) => void,
) {
  const setHiddenRef = useRef(setHidden)
  setHiddenRef.current = setHidden

  useEffect(() => {
    let gesture: { startX: number; startY: number; pointerId: number } | null = null

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return
      const barHeight = navRef.current?.offsetHeight ?? 0
      const zoneTop = window.innerHeight - (barHeight + BOTTOM_NAV_SWIPE_ZONE_EXTRA_PX)
      if (barHeight <= 0 || event.clientY < zoneTop) return
      gesture = { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId }
    }

    function handlePointerUp(event: PointerEvent) {
      if (gesture == null || gesture.pointerId !== event.pointerId) return
      const completedGesture = gesture
      gesture = null
      const intent = bottomNavSwipeIntent({
        startX: completedGesture.startX,
        startY: completedGesture.startY,
        endX: event.clientX,
        endY: event.clientY,
        viewportHeight: window.innerHeight,
        barHeight: navRef.current?.offsetHeight ?? 0,
      })
      if (intent === 'hide') setHiddenRef.current(true)
      if (intent === 'show') setHiddenRef.current(false)
    }

    function handlePointerCancel(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId) gesture = null
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [navRef])
}
