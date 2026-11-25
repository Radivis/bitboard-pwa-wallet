/** Extra space below the top bar that still opens the network drawer. */
export const NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX = 50

export function networkDrawerSwipeMode({
  open,
  startY,
  headerBottom,
  startedOnPanel,
}: {
  open: boolean
  startY: number
  headerBottom: number | null
  startedOnPanel: boolean
}): 'open' | 'close' | null {
  if (open && startedOnPanel) return 'close'
  if (open || headerBottom == null) return null
  const zoneBottom = headerBottom + NETWORK_DRAWER_OPEN_ZONE_EXTRA_PX
  return startY <= zoneBottom ? 'open' : null
}
