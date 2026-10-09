export type BarkRailFlushMetadata = {
  receiveKeyIndex?: number
  lastSuccessfulSyncAt?: string
}

/** Resolves only after the checkpoint dump has been persisted. */
export function durableCheckpointFlush(
  persistDump: (recordDump: string) => Promise<void>,
): (recordDump: string) => Promise<void> {
  return async (recordDump: string) => {
    await persistDump(recordDump)
  }
}

/** One Bark worker call at a time, including a checkpoint flush awaited inside it. */
export function createBarkCallQueue(): <T>(operation: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve()
  return function enqueueBarkCall<T>(operation: () => Promise<T>): Promise<T> {
    const run = tail.then(operation, operation)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function barkErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Runs one mutating Bark call, then exports the dump when the session is open.
 * A checkpoint flush inside `operation` is separate and happens before this return.
 */
export async function finishBarkMutation<T>(params: {
  sessionOpen: boolean
  operation: () => Promise<T>
  flushProtocolState: (metadata: BarkRailFlushMetadata) => Promise<void>
  metadata: (result: T) => BarkRailFlushMetadata
}): Promise<T> {
  let operationError: unknown
  let result: T | undefined
  try {
    result = await params.operation()
  } catch (err) {
    operationError = err
  }

  let flushError: unknown
  if (params.sessionOpen) {
    try {
      const flushMetadata =
        operationError == null && result !== undefined ? params.metadata(result) : {}
      await params.flushProtocolState(flushMetadata)
    } catch (err) {
      flushError = err
    }
  }

  if (operationError != null && flushError != null) {
    throw new Error(
      `${barkErrorMessage(operationError)} (Bark record dump was not saved: ${barkErrorMessage(flushError)})`,
    )
  }
  if (flushError != null) {
    throw flushError
  }
  if (operationError != null) {
    throw operationError
  }
  return result as T
}
