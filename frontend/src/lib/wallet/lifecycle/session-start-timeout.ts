export const SESSION_START_TIMEOUT_MS = 30_000

export class SessionStartTimeoutError extends Error {
  constructor(railName: 'Arkade' | 'Bark') {
    super(`${railName} session start timed out`)
    this.name = 'SessionStartTimeoutError'
  }
}

export function isSessionStartTimeoutError(error: unknown): error is SessionStartTimeoutError {
  return error instanceof SessionStartTimeoutError
}

export type SessionStartTimeout = {
  promise: Promise<never>
  cancel: () => void
}

/**
 * Rejects with {@link SessionStartTimeoutError} when session start is still running
 * after {@link SESSION_START_TIMEOUT_MS}. `onTimeout` runs before that rejection.
 */
export function createSessionStartTimeout(
  railName: 'Arkade' | 'Bark',
  onTimeout: () => void,
): SessionStartTimeout {
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      onTimeout()
      reject(new SessionStartTimeoutError(railName))
    }, SESSION_START_TIMEOUT_MS)
  })

  return {
    promise,
    cancel() {
      if (settled) return
      settled = true
      if (timer != null) clearTimeout(timer)
    },
  }
}

/**
 * Session start against its deadline.
 * A late failure of `work` is swallowed once the race has settled, so an abandoned
 * open cannot surface a second error.
 */
export async function raceSessionStart<T>(
  work: Promise<T>,
  timeout: SessionStartTimeout,
): Promise<T> {
  void work.catch(() => undefined)
  try {
    return await Promise.race([work, timeout.promise])
  } finally {
    timeout.cancel()
  }
}
