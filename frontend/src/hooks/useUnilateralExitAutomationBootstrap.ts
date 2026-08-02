import { useEffect } from 'react'
import { bootstrapUnilateralExitAutomation } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'

/** Wires automatic unilateral-exit scheduling (module singleton; not a React polling loop). */
export function useUnilateralExitAutomationBootstrap(): void {
  useEffect(() => {
    bootstrapUnilateralExitAutomation()
  }, [])
}
