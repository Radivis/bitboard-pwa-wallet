/**
 * Single FIFO queue for all lab worker + SQLite operations.
 * Prevents overlapping persist/hydrate/mine and keeps worker memory aligned with DB.
 */
import {
  withLabWriterLock,
} from '@/lib/shared/opfs-writer-lock'

let labOperationChain: Promise<unknown> = Promise.resolve()

async function runAfterPreviousTail<T>(
  previousTail: Promise<unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  await previousTail.catch(() => undefined)
  return operation()
}

export async function runLabOp<T>(operation: () => Promise<T>): Promise<T> {
  const previousTail = labOperationChain
  const workPromise = runAfterPreviousTail(previousTail, operation)
  labOperationChain = workPromise
    .then(() => undefined)
    .catch(() => undefined)
  return workPromise
}

/** Mutating lab ops that read-modify-write chain state before {@link persistLabState}. */
export async function runLabWriteOp<T>(operation: () => Promise<T>): Promise<T> {
  return runLabOp(() => withLabWriterLock(operation))
}

/**
 * Waits until the FIFO queue of lab + main-thread SQLite work is idle.
 * Use before tearing down the lab SQLite connection (e.g. factory reset).
 */
export function awaitLabOperationQueueDrained(): Promise<void> {
  return labOperationChain
    .then(() => undefined)
    .catch(() => undefined)
}
