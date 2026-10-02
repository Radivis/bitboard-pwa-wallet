import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const workerMocks = vi.hoisted(() => ({
  sync: vi.fn(),
  readSpendableBalance: vi.fn(),
}))

const loadSnapshot = vi.hoisted(() => ({
  current: {
    loadPhase: 'loaded' as 'loaded' | 'loading' | 'load-error' | 'not-configured',
    networkMode: 'signet' as const,
    errorMessage: null as string | null,
    receiveKeyIndex: 0 as number | null,
  },
}))

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => featureState,
  },
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => workerMocks,
}))

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  getBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
}))

import {
  getBarkSyncLifecycleSnapshot,
  orchestrateBarkSync,
  resetBarkSyncLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'

describe('bark-sync-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetBarkSyncLifecycleStateForTests()
    vi.clearAllMocks()
    featureState.isBarkEnabled = true
    loadSnapshot.current = {
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    }
    workerMocks.sync.mockResolvedValue({
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
    })
    workerMocks.readSpendableBalance.mockResolvedValue({
      spendableSats: 50_000,
      lockedSats: 12_000,
    })
  })

  it('stores spendable sats after a successful sync', async () => {
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    expect(workerMocks.sync).toHaveBeenCalledOnce()
    expect(workerMocks.readSpendableBalance).toHaveBeenCalledOnce()
    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'not-syncing',
      spendableSats: 50_000,
      lockedSats: 12_000,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      errorMessage: null,
    })
  })

  it('keeps the last spendable amount when a later sync throws', async () => {
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    workerMocks.sync.mockRejectedValueOnce(new Error('Bark server unreachable'))

    await expect(
      orchestrateBarkSync({ walletId: 1, networkMode: 'signet' }),
    ).rejects.toThrow('Bark server unreachable')

    expect(workerMocks.readSpendableBalance).toHaveBeenCalledOnce()
    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'sync-error',
      spendableSats: 50_000,
      lockedSats: 12_000,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      errorMessage: 'Bark server unreachable',
    })
  })

  it('shows a sync error and no amount when the first sync of a session fails', async () => {
    workerMocks.sync.mockRejectedValueOnce(new Error('Bark server unreachable'))

    await orchestrateBarkSync({
      walletId: 1,
      networkMode: 'signet',
      throwOnError: false,
    })

    expect(workerMocks.readSpendableBalance).not.toHaveBeenCalled()
    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'sync-error',
      spendableSats: null,
      lockedSats: null,
      lastSuccessfulSyncAt: null,
      errorMessage: 'Bark server unreachable',
    })
  })

  it('BARK-SYNC-05 keeps the spendable amount when refresh scheduling warns', async () => {
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    workerMocks.sync.mockResolvedValueOnce({
      lastSuccessfulSyncAt: '2024-03-02T12:00:00.000Z',
      refreshStatus: 'warning',
    })
    workerMocks.readSpendableBalance.mockResolvedValueOnce({
      spendableSats: 50_000,
      lockedSats: 12_000,
    })

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'not-syncing',
      spendableSats: 50_000,
      lockedSats: 12_000,
      lastSuccessfulSyncAt: '2024-03-02T12:00:00.000Z',
      errorMessage: null,
      refreshStatus: 'warning',
    })
  })
})
