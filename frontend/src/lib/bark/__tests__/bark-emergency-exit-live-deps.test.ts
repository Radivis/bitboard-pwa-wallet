import { beforeEach, describe, expect, it, vi } from 'vitest'

const walletState = vi.hoisted(() => ({
  activeWalletId: 1 as number | null,
  networkMode: 'signet' as const,
}))

const syncMock = vi.hoisted(() => vi.fn())

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => walletState,
  },
}))

vi.mock('@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator', () => ({
  orchestrateBarkSync: syncMock,
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => ({}),
}))

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => ({}),
}))

vi.mock('@/lib/wallet/bitcoin-utils', () => ({
  getEsploraUrl: () => 'https://esplora.example',
}))

import { barkEmergencyExitClaimDeps } from '@/lib/bark/bark-emergency-exit-live-deps'

describe('barkEmergencyExitClaimDeps', () => {
  beforeEach(() => {
    syncMock.mockReset()
    walletState.activeWalletId = 1
    walletState.networkMode = 'signet'
  })

  it('asks Bark sync to throw so a failed sync can become a claim warning', async () => {
    syncMock.mockRejectedValueOnce(new Error('Bark server unreachable'))

    await expect(barkEmergencyExitClaimDeps().syncBark()).rejects.toThrow(
      'Bark server unreachable',
    )
    expect(syncMock).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
      throwOnError: true,
      settleExits: false,
    })
  })
})
