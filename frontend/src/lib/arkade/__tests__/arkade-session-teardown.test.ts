import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resetUnilateralExitForArkadeSessionTeardown } = vi.hoisted(() => ({
  resetUnilateralExitForArkadeSessionTeardown: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime', () => ({
  resetUnilateralExitForArkadeSessionTeardown,
}))

vi.mock('@/lib/arkade/arkade-persistence-store-sync', () => ({
  clearArkadeDashboardStore: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-dashboard-sync', () => ({
  removeArkadeDashboardSyncQueries: vi.fn(),
}))

vi.mock('@/lib/arkade/arkade-query-keys', () => ({
  removeArkadeDashboardQueries: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  forceResetArkadeLoadLifecycleForTeardown: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator', () => ({
  forceResetArkadeSaveLifecycleForTeardown: vi.fn(),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  forceResetArkadeSyncLifecycleForTeardown: vi.fn(),
}))

vi.mock('@/workers/arkade-factory', () => ({
  terminateArkadeWorker: vi.fn(),
}))

import { tearDownArkadeWorkerAndClientState } from '@/lib/arkade/arkade-session-teardown'

describe('tearDownArkadeWorkerAndClientState', () => {
  beforeEach(() => {
    resetUnilateralExitForArkadeSessionTeardown.mockClear()
  })

  it('invokes unilateral-exit reset', () => {
    tearDownArkadeWorkerAndClientState()
    expect(resetUnilateralExitForArkadeSessionTeardown).toHaveBeenCalled()
  })
})
