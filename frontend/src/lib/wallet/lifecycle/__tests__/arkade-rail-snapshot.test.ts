import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: vi.fn(() => ({ loadPhase: 'loaded', networkMode: 'signet' })),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator', () => ({
  getArkadeSyncLifecycleSnapshot: vi.fn(() => ({ syncPhase: 'not-syncing', railScope: null })),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator', () => ({
  getArkadeSaveLifecycleSnapshot: vi.fn(() => ({ savePhase: 'not-saving', errorMessage: null, railScope: null })),
}))

import { getArkadeLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator'
import { getArkadeSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-sync-lifecycle-orchestrator'
import { getArkadeSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/arkade-save-lifecycle-orchestrator'
import { getArkadeRailSnapshot } from '@/lib/wallet/lifecycle/arkade-rail-snapshot'

describe('arkade-rail-snapshot', () => {
  beforeEach(() => {
    vi.mocked(getArkadeLoadLifecycleSnapshot).mockReturnValue({
      loadPhase: 'loaded',
      networkMode: 'signet',
    })
    vi.mocked(getArkadeSyncLifecycleSnapshot).mockReturnValue({
      syncPhase: 'syncing',
      railScope: { walletId: 1, networkMode: 'signet', connectionId: 'c1' },
    })
    vi.mocked(getArkadeSaveLifecycleSnapshot).mockReturnValue({
      savePhase: 'not-saving',
      errorMessage: null,
      railScope: { walletId: 1, networkMode: 'signet', connectionId: 'c1' },
    })
  })

  it('getArkadeRailSnapshot reflects three phases', () => {
    expect(getArkadeRailSnapshot()).toEqual({
      loadPhase: 'loaded',
      syncPhase: 'syncing',
      savePhase: 'not-saving',
    })
  })

  it('returns not-configured sync/save when load not-configured', () => {
    vi.mocked(getArkadeLoadLifecycleSnapshot).mockReturnValue({
      loadPhase: 'not-configured',
      networkMode: null,
    })

    expect(getArkadeRailSnapshot()).toEqual({
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    })
  })
})
