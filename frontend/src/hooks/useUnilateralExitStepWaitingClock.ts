import { useEffect, useMemo, useState } from 'react'
import { UNILATERAL_EXIT_WAITING_CLOCK_TICK_MS } from '@/lib/arkade/arkade-query-timings'

export function formatUnilateralExitStepWaitingDuration(elapsedSeconds: number): string {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }
  if (elapsedSeconds < 3_600) {
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = elapsedSeconds % 60
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(elapsedSeconds / 3_600)
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60)
  const seconds = elapsedSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s`
}

/** Wall-clock label for how long the current step has been waiting for confirmation. */
export function useUnilateralExitStepWaitingClock(
  currentStepRelayedSinceUnix: number | null,
): string | null {
  const [nowUnixSeconds, setNowUnixSeconds] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (currentStepRelayedSinceUnix == null) {
      return
    }
    setNowUnixSeconds(Math.floor(Date.now() / 1000))
    const timerId = window.setInterval(() => {
      setNowUnixSeconds(Math.floor(Date.now() / 1000))
    }, UNILATERAL_EXIT_WAITING_CLOCK_TICK_MS)
    return () => window.clearInterval(timerId)
  }, [currentStepRelayedSinceUnix])

  return useMemo(() => {
    if (currentStepRelayedSinceUnix == null) {
      return null
    }
    const elapsedSeconds = Math.max(0, nowUnixSeconds - currentStepRelayedSinceUnix)
    return formatUnilateralExitStepWaitingDuration(elapsedSeconds)
  }, [currentStepRelayedSinceUnix, nowUnixSeconds])
}
