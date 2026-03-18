/**
 * Single FIFO queue for all lab worker + SQLite operations.
 * Prevents overlapping persist/hydrate/mine and keeps worker memory aligned with DB.
 */
let labOperationChain: Promise<unknown> = Promise.resolve()

export function runLabOp<T>(operation: () => Promise<T>): Promise<T> {
  const next = labOperationChain.then(operation, operation)
  labOperationChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
