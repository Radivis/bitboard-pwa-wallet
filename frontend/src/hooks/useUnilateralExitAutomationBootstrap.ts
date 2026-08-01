import { useEffect } from 'react'
import { bootstrapUnilateralExitAutomation } from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'

/** Wires automatic unilateral-exit scheduling (module singleton; not a React polling loop). */
export function useUnilateralExitAutomationBootstrap(): void {
  useEffect(() => {
    bootstrapUnilateralExitAutomation()
  }, [])
}
