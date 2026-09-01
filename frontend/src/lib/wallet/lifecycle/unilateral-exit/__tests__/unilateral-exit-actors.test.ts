import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeQueriesMock = vi.hoisted(() => vi.fn(async () => {}))
const invalidateQueriesMock = vi.hoisted(() => vi.fn(async () => {}))
const setQueryDataMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    removeQueries: (...args: unknown[]) => removeQueriesMock(...args),
    invalidateQueries: (...args: unknown[]) => invalidateQueriesMock(...args),
    setQueryData: (...args: unknown[]) => setQueryDataMock(...args),
  },
}))

vi.mock('@/workers/arkade-factory', () => ({
  getArkadeWorker: () => ({}),
}))

import { invalidateUnilateralExitQueries } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-query-cache'
import {
  arkadeBalanceQueryKey,
  arkadeUnilateralExitProgressQueryKey,
  arkadeUnilateralExitTopologyScopeKey,
} from '@/lib/arkade/arkade-query-keys'
import type { ArkadeUnilateralExitProgress } from '@/workers/arkade-api'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  arkadeAccountId: 'conn-1',
}

const leaf = { txid: 'aa'.repeat(32), vout: 0 }

const progress: ArkadeUnilateralExitProgress = {
  stepIndex: 1,
  totalSteps: 3,
  phase: 'waiting',
  currentStepTxRelayed: true,
  nodeStatuses: [],
  leafStatuses: [],
}

describe('invalidateUnilateralExitQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not remove or invalidate the progress query', async () => {
    await invalidateUnilateralExitQueries(walletScope, [leaf])

    const progressQueryKey = arkadeUnilateralExitProgressQueryKey(
      walletScope.walletId,
      walletScope.networkMode,
      walletScope.arkadeAccountId,
      [leaf],
    )
    expect(removeQueriesMock).not.toHaveBeenCalled()
    expect(invalidateQueriesMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: progressQueryKey }),
    )
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: arkadeBalanceQueryKey(
        walletScope.walletId,
        walletScope.networkMode,
        walletScope.arkadeAccountId,
      ),
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: arkadeUnilateralExitTopologyScopeKey(
        walletScope.walletId,
        walletScope.networkMode,
        walletScope.arkadeAccountId,
      ),
    })
  })

  it('seeds progress cache when progress is provided', async () => {
    await invalidateUnilateralExitQueries(walletScope, [leaf], progress)

    expect(setQueryDataMock).toHaveBeenCalledWith(
      arkadeUnilateralExitProgressQueryKey(
        walletScope.walletId,
        walletScope.networkMode,
        walletScope.arkadeAccountId,
        [leaf],
      ),
      progress,
    )
    expect(removeQueriesMock).not.toHaveBeenCalled()
  })
})
