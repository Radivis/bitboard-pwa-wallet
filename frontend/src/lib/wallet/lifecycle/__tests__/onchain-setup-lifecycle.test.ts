import { beforeEach, describe, expect, it, vi } from 'vitest'

const orchestrateOnchainLoad = vi.fn()
const orchestrateOnchainSyncThenSave = vi.fn()
const loadCustomEsploraUrl = vi.fn()
const getBalance = vi.fn()
const getTransactionList = vi.fn()
const setBalance = vi.fn()
const setTransactions = vi.fn()

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  orchestrateOnchainLoad: (...args: unknown[]) => orchestrateOnchainLoad(...args),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', () => ({
  orchestrateOnchainSyncThenSave: (...args: unknown[]) =>
    orchestrateOnchainSyncThenSave(...args),
}))

vi.mock('@/lib/wallet/wallet-utils', () => ({
  loadCustomEsploraUrl: (...args: unknown[]) => loadCustomEsploraUrl(...args),
}))

vi.mock('@/lib/wallet/bitcoin-utils', () => ({
  getEsploraUrl: (network: string, custom: string | null) =>
    custom ?? (network === 'lab' ? null : `https://esplora.${network}`),
}))

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({
      getBalance,
      getTransactionList,
    }),
  },
}))

vi.mock('@/stores/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      setBalance,
      setTransactions,
    }),
  },
}))

import { orchestrateOnchainSetupAfterPersist } from '@/lib/wallet/lifecycle/onchain-setup-lifecycle'

const setupParams = {
  walletId: 1,
  networkMode: 'signet' as const,
  addressType: 'taproot' as const,
  accountId: 0,
}

describe('LIFE-ONC-SETUP-01 orchestrateOnchainSetupAfterPersist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orchestrateOnchainLoad.mockResolvedValue(undefined)
    orchestrateOnchainSyncThenSave.mockResolvedValue(undefined)
    loadCustomEsploraUrl.mockResolvedValue(null)
    getBalance.mockResolvedValue({ totalSats: 0 })
    getTransactionList.mockResolvedValue([])
  })

  it('runs load then a single orchestrated setupInitial full scan', async () => {
    await orchestrateOnchainSetupAfterPersist(setupParams)

    expect(orchestrateOnchainLoad).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      clearLastSyncTime: true,
    })
    expect(orchestrateOnchainSyncThenSave).toHaveBeenCalledTimes(1)
    expect(orchestrateOnchainSyncThenSave).toHaveBeenCalledWith({
      walletId: 1,
      networkMode: 'signet',
      addressType: 'taproot',
      accountId: 0,
      syncKind: 'setupInitial',
      useFullScan: true,
      markFullScanDone: true,
      awaitCompletion: true,
      throwOnError: true,
    })
  })

  it('refreshes WASM balance/tx only when no Esplora URL (lab)', async () => {
    await orchestrateOnchainSetupAfterPersist({
      ...setupParams,
      networkMode: 'lab',
    })

    expect(orchestrateOnchainLoad).toHaveBeenCalled()
    expect(orchestrateOnchainSyncThenSave).not.toHaveBeenCalled()
    expect(getBalance).toHaveBeenCalled()
    expect(getTransactionList).toHaveBeenCalled()
    expect(setBalance).toHaveBeenCalled()
    expect(setTransactions).toHaveBeenCalled()
  })
})
