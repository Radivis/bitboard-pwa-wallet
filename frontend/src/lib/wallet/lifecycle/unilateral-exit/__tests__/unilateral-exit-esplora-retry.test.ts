import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getUnilateralExitProgress = vi.hoisted(() => vi.fn())
const evaluateUnilateralExitJobViability = vi.hoisted(() => vi.fn())
const listVtxoExitRecords = vi.hoisted(() => vi.fn(async () => []))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({
    getUnilateralExitProgress,
    evaluateUnilateralExitJobViability,
    listVtxoExitRecords,
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
import {
  registerVtxoExitHydrateSender,
  resetVtxoExitHydrateSenderForTests,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-vtxo-hydrate'

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
    listVtxoExitRecords.mockReset()
    listVtxoExitRecords.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    resetVtxoExitHydrateSenderForTests()
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

  it('progress fetch hydrates vtxo exit records after wasm write', async () => {
    const send = vi.fn()
    const records = [
      {
        txid: leaf.txid,
        vout: leaf.vout,
        amountSats: 1,
        phase: 'tagged' as const,
        hostTxid: leaf.txid,
        taggedAt: 1,
      },
    ]
    getUnilateralExitProgress.mockResolvedValue(idleProgress)
    listVtxoExitRecords.mockResolvedValue(records)
    registerVtxoExitHydrateSender(send)

    await loadUnilateralExitProgressWithRetries({
      walletScope,
      outpoints: [leaf],
    })

    expect(getUnilateralExitProgress).toHaveBeenCalledTimes(1)
    expect(listVtxoExitRecords).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(records)
  })
})
