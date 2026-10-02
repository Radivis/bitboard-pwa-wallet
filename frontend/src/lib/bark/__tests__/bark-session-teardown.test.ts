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

const awaitBarkLoadQuiescence = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const discardShownBarkLoadForSessionChange = vi.hoisted(() => vi.fn())
const forceResetBarkLoadLifecycleForTeardown = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  awaitBarkLoadQuiescence: () => awaitBarkLoadQuiescence(),
  discardShownBarkLoadForSessionChange: () => discardShownBarkLoadForSessionChange(),
  forceResetBarkLoadLifecycleForTeardown: () => forceResetBarkLoadLifecycleForTeardown(),
  orchestrateBarkLoad: vi.fn(),
}))

const awaitBarkSyncQuiescence = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const discardShownBarkBalanceForSessionChange = vi.hoisted(() => vi.fn())
const forceResetBarkSyncLifecycleForTeardown = vi.hoisted(() => vi.fn())
const removeBarkWalletQueries = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator', () => ({
  awaitBarkSyncQuiescence: () => awaitBarkSyncQuiescence(),
  discardShownBarkBalanceForSessionChange: () => discardShownBarkBalanceForSessionChange(),
  forceResetBarkSyncLifecycleForTeardown: () => forceResetBarkSyncLifecycleForTeardown(),
}))

vi.mock('@/lib/bark/bark-wallet-queries', () => ({
  removeBarkWalletQueries: () => removeBarkWalletQueries(),
}))

import { closeBarkSession, closeBarkSessionForWalletChange } from '@/lib/bark/bark-session-service'

describe('closeBarkSession', () => {
  beforeEach(() => {
    callOrder.length = 0
    closeSession.mockResolvedValue(undefined)
    terminateBarkWorker.mockReset()
  })

  it('hides the previous balance before waiting, then closes and terminates the worker', async () => {
    await closeBarkSession()

    expect(callOrder).toEqual(['close', 'terminate'])
    expect(discardShownBarkBalanceForSessionChange).toHaveBeenCalled()
    expect(discardShownBarkLoadForSessionChange).toHaveBeenCalled()
    expect(awaitBarkSyncQuiescence).toHaveBeenCalled()
    expect(forceResetBarkSyncLifecycleForTeardown).toHaveBeenCalled()
    expect(removeBarkWalletQueries).toHaveBeenCalled()
    expect(discardShownBarkBalanceForSessionChange.mock.invocationCallOrder[0]).toBeLessThan(
      awaitBarkSyncQuiescence.mock.invocationCallOrder[0],
    )
  })

  it('aborts the worker when quiescence fails during a wallet change', async () => {
    awaitBarkSyncQuiescence.mockRejectedValueOnce(new Error('sync still running'))

    await closeBarkSessionForWalletChange()

    expect(terminateBarkWorker).toHaveBeenCalled()
    expect(forceResetBarkSyncLifecycleForTeardown).toHaveBeenCalled()
    expect(removeBarkWalletQueries).toHaveBeenCalled()
  })
})
