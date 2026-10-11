import { beforeEach, describe, expect, it, vi } from 'vitest'

const walletState = vi.hoisted(() => ({
  activeWalletId: 1 as number | null,
  networkMode: 'signet' as const,
}))

const syncMock = vi.hoisted(() => vi.fn())

const barkWorkerMock = vi.hoisted(() => ({
  readPendingEmergencyClaim: vi.fn(),
  drainEmergencyExits: vi.fn(),
  writePendingEmergencyClaim: vi.fn(),
  broadcastEmergencyExitClaim: vi.fn(),
  syncEmergencyExits: vi.fn(),
}))

const cryptoWorkerMock = vi.hoisted(() => ({
  broadcastTransaction: vi.fn(),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => walletState,
  },
}))

vi.mock('@/lib/wallet/lifecycle/bark-sync-lifecycle-orchestrator', () => ({
  orchestrateBarkSync: syncMock,
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  orchestrateOnchainSyncThenSave: vi.fn(async () => undefined),
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => barkWorkerMock,
}))

vi.mock('@/workers/crypto-factory', () => ({
  getCryptoWorker: () => cryptoWorkerMock,
}))

vi.mock('@/lib/wallet/bitcoin-utils', () => ({
  getEsploraUrl: () => 'https://esplora.example',
}))

import { barkEmergencyExitClaimDeps } from '@/lib/bark/bark-emergency-exit-live-deps'
import { claimBarkEmergencyExits } from '@/lib/bark/perform-bark-emergency-exit'

describe('barkEmergencyExitClaimDeps', () => {
  beforeEach(() => {
    syncMock.mockReset()
    walletState.activeWalletId = 1
    walletState.networkMode = 'signet'
    barkWorkerMock.readPendingEmergencyClaim.mockResolvedValue(null)
    barkWorkerMock.drainEmergencyExits.mockResolvedValue({
      psbtHex: '00',
      rawTxHex: '00',
      vtxoIds: ['vtxo-1'],
    })
    barkWorkerMock.writePendingEmergencyClaim.mockResolvedValue(undefined)
    barkWorkerMock.broadcastEmergencyExitClaim.mockResolvedValue(undefined)
    barkWorkerMock.syncEmergencyExits.mockResolvedValue([
      { vtxoId: 'vtxo-1', state: 'claimInProgress', cancelable: false },
    ])
    cryptoWorkerMock.broadcastTransaction.mockResolvedValue('txid-claim')
  })

  it('BARK-EMG-24 a claim does not run a Bark sync, so it never contacts the Ark server', async () => {
    await expect(
      claimBarkEmergencyExits(barkEmergencyExitClaimDeps(), 'tb1qcurrent', 2),
    ).resolves.toEqual({ txid: 'txid-claim', observed: true })

    expect(syncMock).not.toHaveBeenCalled()
  })
})
