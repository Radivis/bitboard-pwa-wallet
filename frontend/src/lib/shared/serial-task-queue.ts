export type SerialTaskQueue = <T>(task: () => Promise<T>) => Promise<T>

/** Runs tasks one at a time in call order. A rejected task does not block later ones. */
export function createSerialTaskQueue(): SerialTaskQueue {
  let tail: Promise<void> = Promise.resolve()
  return function runSerially<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
