import { describe, expect, it } from 'vitest'
import {
  buildArkadeWalletScope,
  resolveUnilateralExitJobOutpoints,
} from '@/lib/wallet/lifecycle/unilateral-exit-job-scope'

const walletScope = {
  walletId: 1,
  networkMode: 'regtest' as const,
  connectionId: 'conn-1',
}

describe('unilateral-exit-job-scope', () => {
  it('buildArkadeWalletScope rejects unsupported networks', () => {
    expect(buildArkadeWalletScope(1, 'mainnet', 'conn-1')).not.toBeNull()
    expect(buildArkadeWalletScope(1, 'lab', 'conn-1')).toBeNull()
  })

  it('resolveUnilateralExitJobOutpoints prefers lifecycle, then persisted, then fallback', () => {
    const lifecycle = [{ txid: 'aa'.repeat(32), vout: 0 }]
    const persisted = {
      selectedLeafOutpoints: [{ txid: 'bb'.repeat(32), vout: 1 }],
      currentStepRelayedSinceUnix: null,
      jobStartedAtUnix: 1_700_000_000,
    }
    const fallback = [{ txid: 'cc'.repeat(32), vout: 2 }]

    expect(
      resolveUnilateralExitJobOutpoints({
        lifecycleOutpoints: lifecycle,
        persistedJob: persisted,
        fallbackOutpoints: fallback,
      }),
    ).toEqual(lifecycle)

    expect(
      resolveUnilateralExitJobOutpoints({
        lifecycleOutpoints: [],
        persistedJob: persisted,
        fallbackOutpoints: fallback,
      }),
    ).toEqual(persisted.selectedLeafOutpoints)

    expect(
      resolveUnilateralExitJobOutpoints({
        lifecycleOutpoints: [],
        fallbackOutpoints: fallback,
      }),
    ).toEqual(fallback)
  })
})
