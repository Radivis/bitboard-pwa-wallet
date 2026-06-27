import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadPhaseRef = vi.hoisted(() => ({ phase: 'loaded' as string }))
const matchingConnectionsRef = vi.hoisted(() => ({
  connections: [
    { id: 'conn-1', label: 'A', config: { type: 'nwc' } },
    { id: 'conn-2', label: 'B', config: { type: 'nwc' } },
  ] as Array<{ id: string; label: string; config: { type: string } }>,
}))

const orchestrateLightningSaveSnapshotPatches = vi.fn()

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: {
    getState: () => ({ isLightningEnabled: true }),
  },
}))

vi.mock('@/lib/lightning/lightning-utils', () => ({
  isLightningSupported: () => true,
}))

vi.mock('@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator', () => ({
  getLightningLoadLifecycleSnapshot: () => ({
    loadPhase: loadPhaseRef.phase,
    networkMode: 'signet',
  }),
}))

vi.mock('@/lib/lightning/lightning-connection-utils', () => ({
  getMatchingLightningConnectionsForDashboard: () => matchingConnectionsRef.connections,
}))

vi.mock('@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateLightningSaveSnapshotPatches: (...args: unknown[]) =>
      orchestrateLightningSaveSnapshotPatches(...args),
    configureLightningSaveForLoadedRail: actual.configureLightningSaveForLoadedRail,
  }
})

import {
  configureLightningSyncForLoadedRailForTests,
  getLightningSyncLifecycleSnapshot,
  orchestrateLightningSyncThenSave,
  resetLightningSyncLifecycleStateForTests,
  runWithLightningConnectionSync,
  setLightningConnectionSyncTrackerForTests,
} from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'

const railScope = {
  walletId: 1,
  networkMode: 'signet' as const,
}

describe('lightning-sync-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetLightningSyncLifecycleStateForTests()
    vi.clearAllMocks()
    loadPhaseRef.phase = 'loaded'
    matchingConnectionsRef.connections = [
      { id: 'conn-1', label: 'A', config: { type: 'nwc' } },
      { id: 'conn-2', label: 'B', config: { type: 'nwc' } },
    ]
    orchestrateLightningSaveSnapshotPatches.mockResolvedValue(undefined)
    configureLightningSyncForLoadedRailForTests(railScope)
  })

  it('sync rejected while loadPhase loading', async () => {
    loadPhaseRef.phase = 'loading'

    await expect(
      orchestrateLightningSyncThenSave({
        ...railScope,
        syncKind: 'manual',
        syncWork: async () => [],
      }),
    ).rejects.toThrow('Lightning sync cannot start while load is in progress')
  })

  it('all connections sync success → not-syncing', async () => {
    await runWithLightningConnectionSync('conn-1', async () => 'ok')
    await runWithLightningConnectionSync('conn-2', async () => 'ok')

    expect(getLightningSyncLifecycleSnapshot().syncPhase).toBe('not-syncing')
  })

  it('one connection fails others succeed → sync-error (any failure)', async () => {
    await runWithLightningConnectionSync('conn-1', async () => 'ok')
    await expect(
      runWithLightningConnectionSync('conn-2', async () => {
        throw new Error('nwc down')
      }),
    ).rejects.toThrow('nwc down')

    expect(getLightningSyncLifecycleSnapshot().syncPhase).toBe('sync-error')
  })

  it('one syncing one error → syncing wins', async () => {
    setLightningConnectionSyncTrackerForTests('conn-1', {
      inFlightCount: 1,
      lastStatus: 'idle',
    })
    setLightningConnectionSyncTrackerForTests('conn-2', {
      inFlightCount: 0,
      lastStatus: 'error',
    })

    expect(getLightningSyncLifecycleSnapshot().syncPhase).toBe('syncing')
  })

  it('orchestrateLightningSyncThenSave persists patches via save', async () => {
    await orchestrateLightningSyncThenSave({
      ...railScope,
      syncKind: 'manual',
      syncWork: async () => [{ connectionId: 'conn-1', balance: { balanceSats: 1, balanceUpdatedAt: 't' } }],
    })

    expect(orchestrateLightningSaveSnapshotPatches).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
      patches: [{ connectionId: 'conn-1', balance: { balanceSats: 1, balanceUpdatedAt: 't' } }],
      refreshDashboardQueriesAfterSave: true,
    })
    expect(getLightningSyncLifecycleSnapshot().syncPhase).toBe('not-syncing')
  })
})
