/** One in-flight full VTXO list. A second schedule while it runs does not start another. */
export function createSingleFlightScheduler(run: () => Promise<void>): () => void {
  let inFlight: Promise<void> | null = null
  return () => {
    if (inFlight != null) {
      return
    }
    const task = run().finally(() => {
      if (inFlight === task) {
        inFlight = null
      }
    })
    inFlight = task
  }
}
