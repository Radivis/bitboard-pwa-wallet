import { useMemo } from 'react'
import { useTickingUnixSeconds } from '@/hooks/useTickingUnixSeconds'
import { formatDurationDaysHoursMinutesSeconds } from '@/lib/shared/format-duration'

/** Wall-clock label for how long the current step has been waiting for confirmation. */
export function useUnilateralExitStepWaitingClock(
  currentStepRelayedSinceUnix: number | null,
): string | null {
  const nowUnixSeconds = useTickingUnixSeconds(
    currentStepRelayedSinceUnix != null,
    currentStepRelayedSinceUnix,
  )

  return useMemo(() => {
    if (currentStepRelayedSinceUnix == null) {
      return null
    }
    const elapsedSeconds = Math.max(0, nowUnixSeconds - currentStepRelayedSinceUnix)
    return formatDurationDaysHoursMinutesSeconds(elapsedSeconds)
  }, [currentStepRelayedSinceUnix, nowUnixSeconds])
}
