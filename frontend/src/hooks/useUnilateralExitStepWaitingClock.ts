import { useEffect, useMemo, useState } from 'react'
import { UNILATERAL_EXIT_WAITING_CLOCK_TICK_MS } from '@/lib/arkade/arkade-query-timings'
import { formatDurationDaysHoursMinutesSeconds } from '@/lib/shared/format-duration'

export function formatUnilateralExitStepWaitingDuration(elapsedSeconds: number): string {
  return formatDurationDaysHoursMinutesSeconds(elapsedSeconds)
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
