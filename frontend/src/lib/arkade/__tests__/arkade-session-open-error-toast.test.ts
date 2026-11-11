import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { SIGNET_ARKADE_SESSION_START_APPENDIX } from '@/lib/arkade/signet-arkade-session-start-note'

const loadSnapshot = vi.hoisted(() => ({
  loadPhase: 'load-error' as const,
  networkMode: 'mutinynet' as 'mutinynet' | 'signet' | null,
  errorMessage: 'Arkade session start timed out',
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  getArkadeLoadLifecycleSnapshot: () => loadSnapshot,
}))

import { reportArkadeSessionOpenError } from '@/lib/arkade/arkade-session-open-error-toast'

describe('reportArkadeSessionOpenError', () => {
  beforeEach(() => {
    loadSnapshot.networkMode = 'mutinynet'
    vi.mocked(toast.error).mockClear()
  })

  it('appends the Signet reliability note to the session-start toast', () => {
    loadSnapshot.networkMode = 'signet'

    reportArkadeSessionOpenError(new Error('Arkade session start timed out'))

    expect(toast.error).toHaveBeenCalledWith('Arkade could not start', {
      description: `Arkade session start timed out: ${SIGNET_ARKADE_SESSION_START_APPENDIX}`,
    })
  })

  it('leaves the session-start toast unchanged off Signet', () => {
    reportArkadeSessionOpenError(new Error('Arkade session start timed out'))

    expect(toast.error).toHaveBeenCalledWith('Arkade could not start', {
      description: 'Arkade session start timed out',
    })
  })
})
