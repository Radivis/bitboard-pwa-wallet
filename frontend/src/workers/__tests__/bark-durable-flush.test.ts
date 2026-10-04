import { describe, expect, it } from 'vitest'
import {
  createBarkCallQueue,
  durableCheckpointFlush,
  finishBarkMutation,
} from '@/workers/bark-durable-flush'

describe('bark durable flush', () => {
  it('checkpoint flush finishes before the operation resolves and the call flushes again', async () => {
    const events: string[] = []
    const hook = durableCheckpointFlush(async (recordDump) => {
      events.push(`checkpoint:${recordDump}`)
    })

    await finishBarkMutation({
      sessionOpen: true,
      operation: async () => {
        await hook('checkpoint-dump')
        events.push('operation-returned')
        return 'accepted'
      },
      flushProtocolState: async () => {
        events.push('final-flush')
      },
      metadata: () => ({}),
    })

    expect(events).toEqual([
      'checkpoint:checkpoint-dump',
      'operation-returned',
      'final-flush',
    ])
  })

  it('a failed operation still flushes when the session is open', async () => {
    const events: string[] = []

    await expect(
      finishBarkMutation({
        sessionOpen: true,
        operation: async () => {
          events.push('operation-failed')
          throw new Error('Bark durable record flush failed')
        },
        flushProtocolState: async () => {
          events.push('final-flush')
        },
        metadata: () => ({ lastSuccessfulSyncAt: '2020-01-01T00:00:00.000Z' }),
      }),
    ).rejects.toThrow('Bark durable record flush failed')

    expect(events).toEqual(['operation-failed', 'final-flush'])
  })

  it('runs bark calls one at a time', async () => {
    const enqueueBarkCall = createBarkCallQueue()
    const events: string[] = []
    let releaseFirst: () => void = () => {}
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = enqueueBarkCall(async () => {
      events.push('first-start')
      await firstCanFinish
      events.push('first-end')
    })
    const second = enqueueBarkCall(async () => {
      events.push('second-start')
    })

    await Promise.resolve()
    expect(events).toEqual(['first-start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first-start', 'first-end', 'second-start'])
  })
})
