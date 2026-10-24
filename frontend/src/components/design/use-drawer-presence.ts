import { useEffect, useState } from 'react'

export const DRAWER_MOTION_DURATION_MS = 250

export const DRAWER_ENTER_FROM_RIGHT_CLASS = 'design-drawer-enter-from-right'
export const DRAWER_EXIT_TO_RIGHT_CLASS = 'design-drawer-exit-to-right'
export const DRAWER_ENTER_FROM_TOP_CLASS = 'design-drawer-enter-from-top'
export const DRAWER_EXIT_TO_TOP_CLASS = 'design-drawer-exit-to-top'

type DrawerMotion = 'enter' | 'exit'

type DrawerPresence = {
  mounted: boolean
  motion: DrawerMotion
}

export function useDrawerPresence(open: boolean): DrawerPresence {
  const [presence, setPresence] = useState<DrawerPresence>({
    mounted: open,
    motion: open ? 'enter' : 'exit',
  })

  if (open && (!presence.mounted || presence.motion !== 'enter')) {
    setPresence({ mounted: true, motion: 'enter' })
  } else if (!open && presence.mounted && prefersReducedMotion()) {
    setPresence({ mounted: false, motion: 'exit' })
  } else if (!open && presence.mounted && presence.motion !== 'exit') {
    setPresence({ mounted: true, motion: 'exit' })
  }

  useEffect(() => {
    if (open || !presence.mounted || presence.motion !== 'exit') return
    const timeout = window.setTimeout(() => {
      setPresence({ mounted: false, motion: 'exit' })
    }, DRAWER_MOTION_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [open, presence.mounted, presence.motion])

  return presence
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
