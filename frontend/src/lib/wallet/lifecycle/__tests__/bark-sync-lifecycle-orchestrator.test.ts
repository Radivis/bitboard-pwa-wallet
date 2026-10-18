import { beforeEach, describe, expect, it, vi } from 'vitest'

const featureState = vi.hoisted(() => ({
  isBarkEnabled: true,
}))

const workerMocks = vi.hoisted(() => ({
  sync: vi.fn(),
  readSpendableBalance: vi.fn(),
  listEmergencyExits: vi.fn(),
  readPendingEmergencyClaim: vi.fn(),
  writePendingEmergencyClaim: vi.fn(),
  progressEmergencyExits: vi.fn(),
  provideEmergencyExitCpfp: vi.fn(),
  readProceedAutomatically: vi.fn(),
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

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => ({
    signP2aCpfpChild: vi.fn(),
    applyUnconfirmedFundingTx: vi.fn(),
  }),
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  presetRatesForNetwork: vi.fn(async () => ({ Low: 1, Medium: 2, High: 4 })),
}))

vi.mock('@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator', () => ({
  getBarkLoadLifecycleSnapshot: () => loadSnapshot.current,
}))

import {
  barkExitChainNoticeIds,
  useBarkExitChainNoticeStore,
} from '@/lib/bark/bark-exit-seizure-notice'
import {
  discardShownBarkBalanceForSessionChange,
  getBarkSyncLifecycleSnapshot,
  orchestrateBarkSync,
  prepareBarkSyncForSessionOpen,
  resetBarkSyncLifecycleStateForTests,
  syncBarkSyncLifecycleWithLockPhase,
} from '@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator'

describe('bark-sync-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetBarkSyncLifecycleStateForTests()
    useBarkExitChainNoticeStore.setState({ notice: null })
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
      exitingSats: 0,
    })
    workerMocks.listEmergencyExits.mockResolvedValue([])
    workerMocks.readPendingEmergencyClaim.mockResolvedValue(null)
    workerMocks.progressEmergencyExits.mockResolvedValue({ requests: [] })
    workerMocks.readProceedAutomatically.mockResolvedValue(false)
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

  it('stores exitingSats in lifecycle snapshot', async () => {
    workerMocks.readSpendableBalance.mockResolvedValueOnce({
      spendableSats: 50_000,
      lockedSats: 12_000,
      exitingSats: 7_500,
    })
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      spendableSats: 50_000,
      lockedSats: 12_000,
      exitingSats: 7_500,
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

  it('shows the Ark server public notice when the browser handshake fails', async () => {
    workerMocks.sync.mockRejectedValueOnce(
      new Error(
        'Failed to connect to Ark server: handshake request failed: TypeError: Failed to fetch',
      ),
    )
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ psa: "We're down, sorry..." }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await orchestrateBarkSync({
      walletId: 1,
      networkMode: 'signet',
      throwOnError: false,
    })

    expect(getBarkSyncLifecycleSnapshot().errorMessage).toBe("We're down, sorry...")
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bark/server-notice?network=signet',
      expect.objectContaining({ cache: 'no-store' }),
    )
    fetchMock.mockRestore()
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

  it('BARK-EMG-17 progresses started exits without dropping the sync stamp when progress throws', async () => {
    workerMocks.listEmergencyExits.mockResolvedValue([
      { vtxoId: 'exit-1', state: 'start', cancelable: true },
    ])
    workerMocks.progressEmergencyExits.mockRejectedValue(
      new Error('bark_exit_insufficient_funds: short'),
    )

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    expect(workerMocks.progressEmergencyExits).toHaveBeenCalledOnce()
    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'not-syncing',
      spendableSats: 50_000,
      lockedSats: 12_000,
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      errorMessage: null,
    })
  })

  it('drops the shown balance when the rail locks', async () => {
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    syncBarkSyncLifecycleWithLockPhase('locked')

    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'not-configured',
      spendableSats: null,
      lockedSats: null,
      lastSuccessfulSyncAt: null,
    })
  })

  it('BARK-SYNC-09 stores the next refresh schedule with the sync time', async () => {
    workerMocks.sync.mockResolvedValueOnce({
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      refreshStatus: 'idle',
      nextRefresh: { tipHeight: 1_000, nextRefreshHeight: 1_144 },
    })

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })

    expect(getBarkSyncLifecycleSnapshot().nextRefresh).toEqual({
      tipHeight: 1_000,
      nextRefreshHeight: 1_144,
      observedAt: '2024-03-01T12:00:00.000Z',
    })
  })

  it('BARK-SYNC-09 keeps the next refresh schedule when a later sync fails', async () => {
    workerMocks.sync.mockResolvedValueOnce({
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      refreshStatus: 'idle',
      nextRefresh: { tipHeight: 1_000, nextRefreshHeight: 1_144 },
    })
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    workerMocks.sync.mockRejectedValueOnce(new Error('Bark server unreachable'))

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet', throwOnError: false })

    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'sync-error',
      nextRefresh: {
        tipHeight: 1_000,
        nextRefreshHeight: 1_144,
        observedAt: '2024-03-01T12:00:00.000Z',
      },
    })
  })

  it('BARK-SYNC-11 shows the stored seizure notice and hides it when the session changes', async () => {
    const storedNotice = {
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      refreshStatus: 'idle' as const,
      nextRefresh: null,
      exitAnchorSweepVtxoIds: ['vtxo-b', 'vtxo-a'],
      exitCheckpointSeizureVtxoIds: ['vtxo-c'],
    }
    workerMocks.sync.mockResolvedValueOnce(storedNotice)
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    expect(barkExitChainNoticeIds(1, 'signet')).toEqual({
      anchorSweepVtxoIds: ['vtxo-a', 'vtxo-b'],
      checkpointSeizureVtxoIds: ['vtxo-c'],
    })

    workerMocks.sync.mockRejectedValueOnce(new Error('Bark server unreachable'))
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet', throwOnError: false })
    expect(getBarkSyncLifecycleSnapshot().syncPhase).toBe('sync-error')
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual(['vtxo-a', 'vtxo-b'])

    syncBarkSyncLifecycleWithLockPhase('locked')
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual([])

    workerMocks.sync.mockResolvedValueOnce(storedNotice)
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    discardShownBarkBalanceForSessionChange()
    expect(barkExitChainNoticeIds(1, 'signet').checkpointSeizureVtxoIds).toEqual([])

    workerMocks.sync.mockResolvedValueOnce(storedNotice)
    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    prepareBarkSyncForSessionOpen('signet')
    expect(barkExitChainNoticeIds(1, 'signet').anchorSweepVtxoIds).toEqual([])
  })

  it('BARK-SYNC-09 clears the next refresh schedule on lock and session change', async () => {
    const syncedWithSchedule = {
      lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
      refreshStatus: 'idle',
      nextRefresh: { tipHeight: 1_000, nextRefreshHeight: 1_144 },
    }
    workerMocks.sync.mockResolvedValue(syncedWithSchedule)

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    syncBarkSyncLifecycleWithLockPhase('locked')
    expect(getBarkSyncLifecycleSnapshot().nextRefresh).toBeNull()

    await orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    discardShownBarkBalanceForSessionChange()
    expect(getBarkSyncLifecycleSnapshot().nextRefresh).toBeNull()

    await orchestrateBarkSync({ walletId: 2, networkMode: 'signet' })
    prepareBarkSyncForSessionOpen('signet')
    expect(getBarkSyncLifecycleSnapshot().nextRefresh).toBeNull()
  })

  it('does not republish a balance after the shown snapshot was discarded', async () => {
    let releaseSync: (() => void) | undefined
    workerMocks.sync.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSync = () =>
            resolve({
              lastSuccessfulSyncAt: '2024-03-01T12:00:00.000Z',
              refreshStatus: 'idle',
            })
        }),
    )

    const syncing = orchestrateBarkSync({ walletId: 1, networkMode: 'signet' })
    await vi.waitFor(() => {
      expect(getBarkSyncLifecycleSnapshot().syncPhase).toBe('syncing')
    })

    discardShownBarkBalanceForSessionChange()
    releaseSync?.()
    await syncing

    expect(getBarkSyncLifecycleSnapshot()).toMatchObject({
      syncPhase: 'not-configured',
      spendableSats: null,
      lockedSats: null,
      lastSuccessfulSyncAt: null,
    })
    expect(workerMocks.readSpendableBalance).not.toHaveBeenCalled()
  })
})
