import { useEffect, useState, type ReactNode } from 'react'
import { designTypeClassName } from '@/components/design/design-type'

export const designGlassBlurClassName = 'backdrop-blur-[5px]'

export const designNavBarSurfaceClassName =
  `bg-[var(--design-elevation-nav-bar)] ${designGlassBlurClassName}`

/* Above the bottom nav (z-40) and its toggle (z-50). The header is z-50 and does not overlap this panel. */
export const designDrawerPanelClassName =
  `design-ui fixed top-14 right-0 z-[70] flex w-[248px] flex-col gap-3 overflow-hidden rounded-bl-[32px] bg-[var(--design-elevation-drawer)] p-4 shadow-[0_12px_24px_-8px_rgb(0_0_0/0.4)] ${designGlassBlurClassName} outline-none`

export const designDrawerBackdropClassName = 'fixed inset-x-0 top-14 bottom-0 z-[60]'

type DrawerBackdropMotion = 'enter' | 'exit'

type DrawerBackdropProps = {
  testId: string
  motion: DrawerBackdropMotion
  onClose: () => void
}

export function DrawerBackdrop({ testId, motion, onClose }: DrawerBackdropProps) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (motion !== 'enter') return
    // Two frames so the transparent veil is painted before opacity transitions to 1.
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setRevealed(true))
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [motion])

  return (
    <div
      data-testid={testId}
      data-design-drawer-backdrop=""
      data-motion={motion}
      data-revealed={motion === 'enter' && revealed ? '' : undefined}
      className={designDrawerBackdropClassName}
      onClick={onClose}
    />
  )
}

export function DrawerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className={`${designTypeClassName.emphasis} text-[var(--design-drawer-label)] uppercase`}>
      {children}
    </p>
  )
}
