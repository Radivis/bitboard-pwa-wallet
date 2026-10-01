import { beforeEach, describe, expect, it, vi } from 'vitest'

const closeSession = vi.hoisted(() => vi.fn())
const terminateBarkWorker = vi.hoisted(() => vi.fn())
const callOrder = vi.hoisted(() => [] as string[])

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorkerIfExists: () => ({
    closeSession: (...args: unknown[]) => {
      callOrder.push('close')
      return closeSession(...args)
    },
  }),
  terminateBarkWorker: (...args: unknown[]) => {
    callOrder.push('terminate')
    terminateBarkWorker(...args)
  },
}))

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  awaitBarkLoadQuiescence: vi.fn().mockResolvedValue(undefined),
  forceResetBarkLoadLifecycleForTeardown: vi.fn(),
  orchestrateBarkLoad: vi.fn(),
}))

import { closeBarkSession } from '@/lib/bark/bark-session-service'

describe('closeBarkSession', () => {
  beforeEach(() => {
    callOrder.length = 0
    closeSession.mockResolvedValue(undefined)
    terminateBarkWorker.mockReset()
    vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn() })
  })

  it('closes the session then terminates the worker without deleting IndexedDB', async () => {
    await closeBarkSession()

    expect(callOrder).toEqual(['close', 'terminate'])
    expect(indexedDB.deleteDatabase).not.toHaveBeenCalled()
  })
})
