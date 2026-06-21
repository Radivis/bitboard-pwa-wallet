import { beforeEach, describe, expect, it, vi } from 'vitest'

const saveLightningConnectionsForWallet = vi.fn()
const batchApplyNwcSnapshotPatches = vi.fn()
const invalidateLightningDashboardQueries = vi.fn()
const invalidateLightningSyncMetadataQueries = vi.fn()

vi.mock('@/lib/lightning/lightning-wallet-secrets', () => ({
  saveLightningConnectionsForWallet: (...args: unknown[]) =>
    saveLightningConnectionsForWallet(...args),
}))

vi.mock('@/lib/lightning/lightning-wallet-snapshot-persistence', () => ({
  batchApplyNwcSnapshotPatches: (...args: unknown[]) =>
    batchApplyNwcSnapshotPatches(...args),
}))

vi.mock('@/lib/lightning/lightning-dashboard-sync', () => ({
  invalidateLightningDashboardQueries: (...args: unknown[]) =>
    invalidateLightningDashboardQueries(...args),
  invalidateLightningSyncMetadataQueries: (...args: unknown[]) =>
    invalidateLightningSyncMetadataQueries(...args),
}))

import {
  acknowledgeLightningSaveErrorForForcedLock,
  getLightningSaveLifecycleSnapshot,
  isLightningSaveBlockingLock,
  orchestrateLightningRetrySave,
  orchestrateLightningSaveConnections,
  orchestrateLightningSaveSnapshotPatches,
  resetLightningSaveLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'

const railScope = {
  walletId: 1,
  networkMode: 'signet' as const,
}

describe('lightning-save-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetLightningSaveLifecycleStateForTests()
    vi.clearAllMocks()
    saveLightningConnectionsForWallet.mockResolvedValue(undefined)
    batchApplyNwcSnapshotPatches.mockResolvedValue(undefined)
  })

  it('save snapshot patches success transitions saving to not-saving', async () => {
    await orchestrateLightningSaveSnapshotPatches({
      ...railScope,
      patches: [{ connectionId: 'conn-1', balance: { balanceSats: 1000, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' } }],
    })

    expect(getLightningSaveLifecycleSnapshot().savePhase).toBe('not-saving')
    expect(batchApplyNwcSnapshotPatches).toHaveBeenCalled()
    expect(invalidateLightningSyncMetadataQueries).toHaveBeenCalled()
    expect(invalidateLightningDashboardQueries).not.toHaveBeenCalled()
  })

  it('save snapshot patches can refresh full dashboard queries when requested', async () => {
    await orchestrateLightningSaveSnapshotPatches({
      ...railScope,
      patches: [{ connectionId: 'conn-1', balance: { balanceSats: 1000, balanceUpdatedAt: '2020-01-01T00:00:00.000Z' } }],
      refreshDashboardQueriesAfterSave: true,
    })

    expect(invalidateLightningDashboardQueries).toHaveBeenCalled()
    expect(invalidateLightningSyncMetadataQueries).not.toHaveBeenCalled()
  })

  it('save connections list success', async () => {
    await orchestrateLightningSaveConnections({
      ...railScope,
      connections: [],
    })

    expect(getLightningSaveLifecycleSnapshot().savePhase).toBe('not-saving')
    expect(saveLightningConnectionsForWallet).toHaveBeenCalled()
  })

  it('save failure sets save-error', async () => {
    batchApplyNwcSnapshotPatches.mockRejectedValue(new Error('disk full'))

    await expect(
      orchestrateLightningSaveSnapshotPatches({
        ...railScope,
        patches: [{ connectionId: 'conn-1' }],
      }),
    ).rejects.toThrow('disk full')
    expect(getLightningSaveLifecycleSnapshot().savePhase).toBe('save-error')
  })

  it('orchestrateLightningRetrySave after save-error', async () => {
    batchApplyNwcSnapshotPatches.mockRejectedValueOnce(new Error('disk full'))
    await expect(
      orchestrateLightningSaveSnapshotPatches({
        ...railScope,
        patches: [{ connectionId: 'conn-1' }],
      }),
    ).rejects.toThrow()

    await orchestrateLightningRetrySave()
    expect(getLightningSaveLifecycleSnapshot().savePhase).toBe('not-saving')
  })

  it('acknowledgeLightningSaveErrorForForcedLock clears block', async () => {
    batchApplyNwcSnapshotPatches.mockRejectedValue(new Error('disk full'))
    await expect(
      orchestrateLightningSaveSnapshotPatches({
        ...railScope,
        patches: [{ connectionId: 'conn-1' }],
      }),
    ).rejects.toThrow()
    expect(isLightningSaveBlockingLock()).toBe(true)

    acknowledgeLightningSaveErrorForForcedLock()
    expect(isLightningSaveBlockingLock()).toBe(false)
  })

  it('isLightningSaveBlockingLock when save-error', async () => {
    batchApplyNwcSnapshotPatches.mockRejectedValue(new Error('disk full'))
    await expect(
      orchestrateLightningSaveSnapshotPatches({
        ...railScope,
        patches: [{ connectionId: 'conn-1' }],
      }),
    ).rejects.toThrow()
    expect(isLightningSaveBlockingLock()).toBe(true)
  })
})
