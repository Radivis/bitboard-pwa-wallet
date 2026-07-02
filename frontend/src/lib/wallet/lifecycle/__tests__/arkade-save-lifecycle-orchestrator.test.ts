import { beforeEach, describe, expect, it, vi } from 'vitest'

const saveLastSuccessfulOperatorSyncAtEncrypted = vi.fn()
const setLastOperatorSyncTime = vi.fn()
const invalidateArkadeDashboardQueries = vi.fn()

vi.mock('@/lib/arkade/arkade-encrypted-persistence-manager', () => ({
  saveLastSuccessfulOperatorSyncAtEncrypted: (...args: unknown[]) =>
    saveLastSuccessfulOperatorSyncAtEncrypted(...args),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  invalidateArkadeDashboardQueries: (...args: unknown[]) =>
    invalidateArkadeDashboardQueries(...args),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setLastOperatorSyncTime,
    }),
  },
}))

import {
  acknowledgeArkadeSaveErrorForForcedLock,
  getArkadeSaveLifecycleSnapshot,
  isArkadeSaveBlockingLock,
  orchestrateArkadeRetrySave,
  orchestrateArkadeSave,
  resetArkadeSaveLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'

const saveParams = {
  walletId: 1,
  networkMode: 'signet' as const,
  connectionId: 'conn-1',
}

describe('arkade-save-lifecycle-orchestrator', () => {
  beforeEach(() => {
    resetArkadeSaveLifecycleStateForTests()
    vi.clearAllMocks()
    saveLastSuccessfulOperatorSyncAtEncrypted.mockResolvedValue(undefined)
  })

  it('save success transitions saving to not-saving', async () => {
    await orchestrateArkadeSave(saveParams)

    expect(getArkadeSaveLifecycleSnapshot().savePhase).toBe('not-saving')
    expect(saveLastSuccessfulOperatorSyncAtEncrypted).toHaveBeenCalled()
    expect(setLastOperatorSyncTime).toHaveBeenCalled()
    expect(invalidateArkadeDashboardQueries).toHaveBeenCalled()
  })

  it('save failure sets save-error', async () => {
    saveLastSuccessfulOperatorSyncAtEncrypted.mockRejectedValue(new Error('disk full'))

    await expect(orchestrateArkadeSave(saveParams)).rejects.toThrow('disk full')
    expect(getArkadeSaveLifecycleSnapshot().savePhase).toBe('save-error')
  })

  it('orchestrateArkadeRetrySave succeeds after save-error', async () => {
    saveLastSuccessfulOperatorSyncAtEncrypted.mockRejectedValueOnce(new Error('disk full'))
    await expect(orchestrateArkadeSave(saveParams)).rejects.toThrow()

    await orchestrateArkadeRetrySave()
    expect(getArkadeSaveLifecycleSnapshot().savePhase).toBe('not-saving')
  })

  it('acknowledgeArkadeSaveErrorForForcedLock clears block', async () => {
    saveLastSuccessfulOperatorSyncAtEncrypted.mockRejectedValue(new Error('disk full'))
    await expect(orchestrateArkadeSave(saveParams)).rejects.toThrow()
    expect(isArkadeSaveBlockingLock()).toBe(true)

    acknowledgeArkadeSaveErrorForForcedLock()
    expect(isArkadeSaveBlockingLock()).toBe(false)
  })
})
