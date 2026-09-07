import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getUnilateralExitProgress = vi.hoisted(() => vi.fn())
const evaluateUnilateralExitJobViability = vi.hoisted(() => vi.fn())

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getUnilateralExitProgress,
    evaluateUnilateralExitJobViability,
  }),
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-query-cache', () => ({
  writeUnilateralExitProgressQueryCache: vi.fn(async () => {}),
  invalidateUnilateralExitQueries: vi.fn(async () => {}),
}))

import {
  evaluateUnilateralExitJobViabilityWithRetries,
  loadUnilateralExitProgressWithRetries,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit.actors'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  arkadeAccountId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

const idleProgress = {
  stepIndex: 69,
  totalSteps: 70,
  phase: 'idle' as const,
  currentStepTxRelayed: true,
  nodeStatuses: [],
  leafStatuses: [],
}

const viabilityOk = {
  status: 'ok' as const,
  reasonCode: 'ok',
  offendingOutpoints: [],
}

const fetchDump = new Error(
  'Blockchain error: Reqwest(reqwest::Error { kind: Request, source: "JsValue(TypeError: Failed to fetch)" })',
)

describe('unilateral exit Esplora fetch retries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getUnilateralExitProgress.mockReset()
    evaluateUnilateralExitJobViability.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loadUnilateralExitProgressWithRetries retries Failed to fetch then succeeds', async () => {
    getUnilateralExitProgress
      .mockRejectedValueOnce(fetchDump)
      .mockResolvedValueOnce(idleProgress)

    const resultPromise = loadUnilateralExitProgressWithRetries({
      walletScope,
      outpoints: [leaf],
    })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(resultPromise).resolves.toEqual(idleProgress)
    expect(getUnilateralExitProgress).toHaveBeenCalledTimes(2)
  })

  it('evaluateUnilateralExitJobViabilityWithRetries retries Failed to fetch then succeeds', async () => {
    evaluateUnilateralExitJobViability
      .mockRejectedValueOnce(fetchDump)
      .mockResolvedValueOnce(viabilityOk)

    const resultPromise = evaluateUnilateralExitJobViabilityWithRetries({
      outpoints: [leaf],
    })
    await vi.advanceTimersByTimeAsync(5000)
    await expect(resultPromise).resolves.toEqual(viabilityOk)
    expect(evaluateUnilateralExitJobViability).toHaveBeenCalledTimes(2)
  })
})
