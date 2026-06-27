export type InFlightLifecycleWork = {
  key: string
  promise: Promise<void>
}

export type InFlightLifecycleTracker = {
  getCurrent: () => InFlightLifecycleWork | null
  begin: (key: string, run: () => Promise<void>) => Promise<void>
  awaitQuiescence: () => Promise<void>
  clearCurrent: () => void
}

export function createInFlightLifecycleTracker(): InFlightLifecycleTracker {
  let inFlight: InFlightLifecycleWork | null = null

  function clearCompletedWork(work: InFlightLifecycleWork): void {
    if (inFlight === work) {
      inFlight = null
    }
  }

  return {
    getCurrent: () => inFlight,

    begin(key, run) {
      const existing = inFlight
      if (existing?.key === key) {
        return existing.promise
      }

      let resolveWork!: () => void
      let rejectWork!: (error: unknown) => void
      const promise = new Promise<void>((resolve, reject) => {
        resolveWork = resolve
        rejectWork = reject
      })
      const work: InFlightLifecycleWork = { key, promise }
      inFlight = work
      void (async () => {
        try {
          await run()
          resolveWork()
        } catch (error) {
          rejectWork(error)
        } finally {
          clearCompletedWork(work)
        }
      })()
      return promise
    },

    async awaitQuiescence() {
      if (inFlight == null) {
        return
      }
      await inFlight.promise
    },

    clearCurrent() {
      inFlight = null
    },
  }
}

/** Returns the in-flight promise when the same key is already running. */
export function getCoalescedInFlightPromise(
  tracker: InFlightLifecycleTracker,
  key: string,
): Promise<void> | null {
  const current = tracker.getCurrent()
  if (current?.key === key) {
    return current.promise
  }
  return null
}

/**
 * Waits for a different in-flight operation to finish, then returns a coalesced
 * promise if the requested key started while waiting.
 */
export async function awaitDifferentInFlightWork(
  tracker: InFlightLifecycleTracker,
  key: string,
): Promise<Promise<void> | null> {
  const current = tracker.getCurrent()
  if (current == null || current.key === key) {
    return null
  }
  await current.promise
  return getCoalescedInFlightPromise(tracker, key)
}
