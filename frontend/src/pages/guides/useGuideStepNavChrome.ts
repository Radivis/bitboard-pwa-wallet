import { useRef, useState } from 'react'

import { useBottomNavSwipe } from '@/components/design/bottom-nav-swipe'

/** Clears the NavStepper footer while it is expanded. */
const GUIDE_STEP_MAIN_PADDING_WITH_NAV_CLASS = 'pb-24'

/** Clears the nav toggle once the step footer has slid away. */
const GUIDE_STEP_MAIN_PADDING_WITH_TOGGLE_CLASS = 'pb-12'

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
