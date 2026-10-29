import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { useBottomNavSwipe } from '@/components/design/bottom-nav-swipe'
import { designNavBarSurfaceClassName } from '@/components/design/design-drawer-chrome'
import { DesignNavToggle } from '@/components/design/DesignNavToggle'
import { cn } from '@/lib/shared/utils'

/** Matches DesignNavToggle's h-5 — used to vertically center the toggle in the bar. */
const GUIDE_STEP_NAV_TOGGLE_HEIGHT = '1.25rem'

/** Invisible stand-in so prev/next clusters keep the toggle's horizontal slot. */
export const GUIDE_STEP_NAV_TOGGLE_SPACER_CLASS_NAME = 'h-5 w-[46px] shrink-0'

export const GUIDE_STEP_NAV_ID = 'guide-step-nav'

/** Clears the NavStepper footer while it is expanded. */
export const GUIDE_STEP_MAIN_PADDING_WITH_NAV_CLASS = 'pb-24'

/** Clears the nav toggle once the step footer has slid away. */
export const GUIDE_STEP_MAIN_PADDING_WITH_TOGGLE_CLASS = 'pb-12'

function useGuideStepNavHeight(
  navRef: RefObject<HTMLElement | null>,
  chromeRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const nav = navRef.current
    const chrome = chromeRef.current
    if (!nav || !chrome) return

    const applyHeight = () => {
      chrome.style.setProperty('--guide-step-nav-height', `${nav.offsetHeight}px`)
    }
    applyHeight()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(applyHeight)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [navRef, chromeRef])
}

export function useGuideStepNavChrome() {
  const [hidden, setHidden] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  useBottomNavSwipe(navRef, setHidden)

  return {
    hidden,
    navRef,
    toggleHidden: () => setHidden((navHidden) => !navHidden),
    mainPaddingClassName: hidden
      ? GUIDE_STEP_MAIN_PADDING_WITH_TOGGLE_CLASS
      : GUIDE_STEP_MAIN_PADDING_WITH_NAV_CLASS,
  }
}

export function GuideStepNavChrome({
  hidden,
  navRef,
  onToggle,
  children,
}: {
  hidden: boolean
  navRef: RefObject<HTMLElement | null>
  onToggle: () => void
  children: ReactNode
}) {
  const chromeRef = useRef<HTMLDivElement>(null)
  const [positionSettled, setPositionSettled] = useState(false)
  useGuideStepNavHeight(navRef, chromeRef)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPositionSettled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      <nav
        ref={navRef}
        id={GUIDE_STEP_NAV_ID}
        aria-label="Guide step navigation"
        aria-hidden={hidden}
        inert={hidden || undefined}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 motion-safe:transition-transform motion-safe:duration-200',
          designNavBarSurfaceClassName,
          hidden && 'pointer-events-none translate-y-full',
        )}
      >
        <div className="mx-auto flex w-full max-w-screen-xl items-center px-2 py-2">{children}</div>
      </nav>
      <div ref={chromeRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="relative mx-auto h-0 max-w-screen-xl">
          <DesignNavToggle
            expanded={!hidden}
            aria-controls={GUIDE_STEP_NAV_ID}
            onClick={onToggle}
            className={cn(
              'pointer-events-auto absolute left-1/2 -translate-x-1/2',
              !hidden && 'bg-transparent backdrop-blur-none',
              positionSettled && 'motion-safe:transition-[bottom] motion-safe:duration-200',
            )}
            style={{
              bottom: hidden
                ? '0.5rem'
                : `calc((var(--guide-step-nav-height, ${GUIDE_STEP_NAV_TOGGLE_HEIGHT}) - ${GUIDE_STEP_NAV_TOGGLE_HEIGHT}) / 2)`,
            }}
          />
        </div>
      </div>
    </>
  )
}
