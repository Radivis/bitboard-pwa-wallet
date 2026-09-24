/**
 * One in-flight full VTXO list. Schedules during that run collapse into one
 * follow-up after it finishes, including when the in-flight run fails.
 */
export function createSingleFlightScheduler(run: () => Promise<void>): () => void {
  let inFlight: Promise<void> | null = null
  let followUpQueued = false

  const start = (): void => {
    const task = run().finally(() => {
      if (inFlight !== task) {
        return
      }
      inFlight = null
      if (!followUpQueued) {
        return
      }
      followUpQueued = false
      start()
    })
    inFlight = task
  }

  return () => {
    if (inFlight != null) {
      followUpQueued = true
      return
    }
    start()
  }
}
