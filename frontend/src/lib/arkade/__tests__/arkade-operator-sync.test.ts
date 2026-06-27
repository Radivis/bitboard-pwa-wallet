import { beforeEach, describe, expect, it, vi } from 'vitest'

const awaitArkadeSyncQuiescenceMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  awaitArkadeSyncQuiescence: (...args: unknown[]) => awaitArkadeSyncQuiescenceMock(...args),
  scheduleBackgroundArkadeOperatorSync: vi.fn(),
}))

import {
  awaitBackgroundArkadeOperatorSync,
  scheduleBackgroundArkadeOperatorSync,
} from '@/lib/arkade/arkade-operator-sync'
import { scheduleBackgroundArkadeOperatorSync as scheduleFromLifecycle } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'

describe('arkade-operator-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('awaitBackgroundArkadeOperatorSync delegates to sync lifecycle quiescence', async () => {
    await awaitBackgroundArkadeOperatorSync()

    expect(awaitArkadeSyncQuiescenceMock).toHaveBeenCalledTimes(1)
  })

  it('scheduleBackgroundArkadeOperatorSync delegates to lifecycle orchestrator', () => {
    scheduleBackgroundArkadeOperatorSync()

    expect(scheduleFromLifecycle).toHaveBeenCalledTimes(1)
  })
})
