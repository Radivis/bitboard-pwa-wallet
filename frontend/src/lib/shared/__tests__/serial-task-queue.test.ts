import { describe, expect, it } from 'vitest'
import { createSerialTaskQueue } from '@/lib/shared/serial-task-queue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('createSerialTaskQueue', () => {
  it('runs queued tasks one at a time in FIFO order', async () => {
    const runSerially = createSerialTaskQueue()
    const events: string[] = []
    const firstGate = deferred<void>()

    const first = runSerially(async () => {
      events.push('first:start')
      await firstGate.promise
      events.push('first:end')
      return 1
    })
    const second = runSerially(async () => {
      events.push('second:start')
      return 2
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    firstGate.resolve()
    await expect(first).resolves.toBe(1)
    await expect(second).resolves.toBe(2)
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('starts the next task after a rejected one', async () => {
    const runSerially = createSerialTaskQueue()
    const failing = runSerially(async () => {
      throw new Error('task failed')
    })
    const following = runSerially(async () => 'ran')

    await expect(failing).rejects.toThrow('task failed')
    await expect(following).resolves.toBe('ran')
  })
})
