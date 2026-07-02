import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator', () => ({
  getLightningLoadLifecycleSnapshot: vi.fn(() => ({ loadPhase: 'loaded', networkMode: 'signet' })),
}))

vi.mock('@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator', () => ({
  getLightningSyncLifecycleSnapshot: vi.fn(() => ({ syncPhase: 'not-syncing', railScope: null })),
}))

vi.mock('@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator', () => ({
  getLightningSaveLifecycleSnapshot: vi.fn(() => ({
    savePhase: 'not-saving',
    errorMessage: null,
    railScope: null,
  })),
}))

import { getLightningLoadLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import { getLightningSyncLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { getLightningSaveLifecycleSnapshot } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { getLightningRailSnapshot } from '@/lib/wallet/lifecycle/lightning-rail-snapshot'

describe('lightning-rail-snapshot', () => {
  beforeEach(() => {
    vi.mocked(getLightningLoadLifecycleSnapshot).mockReturnValue({
      loadPhase: 'loaded',
      networkMode: 'signet',
    })
    vi.mocked(getLightningSyncLifecycleSnapshot).mockReturnValue({
      syncPhase: 'syncing',
      railScope: { walletId: 1, networkMode: 'signet' },
    })
    vi.mocked(getLightningSaveLifecycleSnapshot).mockReturnValue({
      savePhase: 'not-saving',
      errorMessage: null,
      railScope: { walletId: 1, networkMode: 'signet' },
    })
  })

  it('getLightningRailSnapshot reflects three phases', () => {
    expect(getLightningRailSnapshot()).toEqual({
      loadPhase: 'loaded',
      syncPhase: 'syncing',
      savePhase: 'not-saving',
    })
  })

  it('returns not-configured sync/save when load not-configured', () => {
    vi.mocked(getLightningLoadLifecycleSnapshot).mockReturnValue({
      loadPhase: 'not-configured',
      networkMode: null,
    })

    expect(getLightningRailSnapshot()).toEqual({
      loadPhase: 'not-configured',
      syncPhase: 'not-configured',
      savePhase: 'not-configured',
    })
  })
})
