import { beforeEach, describe, expect, it, vi } from 'vitest'

const CUSTOM_ESPLORA_URL = 'https://my-own-esplora.example/api'
const PENDING_CLAIM = { txid: 'claim-txid', vtxoIds: ['vtxo-1'] }

const customEsploraUrlState = vi.hoisted(() => ({ current: null as string | null }))

const barkWorkerMock = vi.hoisted(() => ({
  readPendingEmergencyClaim: vi.fn(),
  listEmergencyExits: vi.fn(),
  writePendingEmergencyClaim: vi.fn(),
}))

const claimTransactionVisibilityMock = vi.hoisted(() => vi.fn())

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => barkWorkerMock,
}))

vi.mock('@/lib/bark/bark-claim-transaction-visibility', () => ({
  claimTransactionVisibility: claimTransactionVisibilityMock,
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  loadCustomEsploraUrl: async () => customEsploraUrlState.current,
}))

vi.mock('@/lib/bark/bark-emergency-exit-progress-deps', () => ({
  runBarkEmergencyExitProgress: vi.fn(),
}))

vi.mock('@/hooks/useEsploraFeePresets', () => ({
  presetRatesForNetwork: vi.fn(),
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: { getState: () => ({ activeWalletId: 1 }) },
}))

import { settleBarkEmergencyExitAfterSync } from '@/lib/bark/bark-emergency-exit-after-sync'

describe('settleBarkEmergencyExitAfterSync', () => {
  beforeEach(() => {
    customEsploraUrlState.current = null
    barkWorkerMock.readPendingEmergencyClaim.mockResolvedValue(PENDING_CLAIM)
    barkWorkerMock.listEmergencyExits.mockResolvedValue([])
    barkWorkerMock.writePendingEmergencyClaim.mockResolvedValue(undefined)
    claimTransactionVisibilityMock.mockReset().mockResolvedValue('unknown')
  })

  it('BARK-EMG-25 checks pending claim visibility against the custom Esplora URL when one is set', async () => {
    customEsploraUrlState.current = CUSTOM_ESPLORA_URL

    await settleBarkEmergencyExitAfterSync('signet')

    expect(claimTransactionVisibilityMock).toHaveBeenCalledWith(
      CUSTOM_ESPLORA_URL,
      PENDING_CLAIM.txid,
    )
  })
})
