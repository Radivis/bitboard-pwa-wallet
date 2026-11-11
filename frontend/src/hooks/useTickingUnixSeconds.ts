import { useEffect, useState } from 'react'
import { UNILATERAL_EXIT_WAITING_CLOCK_TICK_MS } from '@/lib/arkade/arkade-query-timings'

/**
 * Unix seconds that advance once per second while `active` is true.
 * A new `restartKey` snaps the clock, so a new timed step does not keep the previous second.
 */
export function useTickingUnixSeconds(active: boolean, restartKey?: unknown): number {
  const [nowUnixSeconds, setNowUnixSeconds] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (!active) {
      return
    }
    setNowUnixSeconds(Math.floor(Date.now() / 1000))
    const timerId = window.setInterval(() => {
      setNowUnixSeconds(Math.floor(Date.now() / 1000))
    }, UNILATERAL_EXIT_WAITING_CLOCK_TICK_MS)
    return () => window.clearInterval(timerId)
  }, [active, restartKey])

  return nowUnixSeconds
}
