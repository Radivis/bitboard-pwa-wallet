import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AddressType } from '@/lib/wallet/wallet-domain-types'

vi.mock('@/db/storage-adapter', () => ({
  sqliteStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}))

const loadLastSuccessfulEsploraSyncAtForDescriptorWallet = vi.fn()

const removeQueriesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    invalidateQueries: vi.fn(),
    removeQueries: (...args: unknown[]) => removeQueriesMock(...args),
  },
}))

vi.mock('@/lib/wallet/onchain-esplora-sync-metadata', () => ({
  loadLastSuccessfulEsploraSyncAtForDescriptorWallet: (...args: unknown[]) =>
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet(...args),
  descriptorWalletKey: vi.fn(
    (params: { network: string; addressType: string; accountId: number }) =>
      `${params.network}:${params.addressType}:${params.accountId}`,
  ),
}))

vi.mock('@/db/database', () => ({
  ensureMigrated: vi.fn(async () => undefined),
}))

import { useWalletStore } from '@/stores/walletStore'
import { resolveOnchainEsploraSyncMetadata, removeOnchainDashboardQueries, ONCHAIN_DASHBOARD_QUERY_KEY } from '@/lib/wallet/onchain-dashboard-sync'

describe('resolveOnchainEsploraSyncMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: 1,
      walletStatus: 'unlocked',
      lastSyncTime: null,
      balance: {
        confirmedSats: 1000,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 1000,
      },
      transactions: [],
      loadedDescriptorWallet: {
        networkMode: 'testnet',
        addressType: AddressType.Taproot,
        accountId: 0,
      },
    })
  })

  it('returns not stale when lastSyncTime is set this session', async () => {
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(isoTimestamp)
    useWalletStore.setState({ lastSyncTime: new Date() })
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(false)
    expect(result.lastSuccessfulEsploraSyncAt).toBe(isoTimestamp)
    expect(loadLastSuccessfulEsploraSyncAtForDescriptorWallet).toHaveBeenCalled()
  })

  it('returns stale when BDK data exists and persisted Esplora sync timestamp exists', async () => {
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(isoTimestamp)
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(true)
    expect(result.lastSuccessfulEsploraSyncAt).toBe(isoTimestamp)
  })

  it('returns stale for empty zero-balance wallet when persisted Esplora sync timestamp exists', async () => {
    useWalletStore.setState({
      balance: {
        confirmedSats: 0,
        trustedPendingSats: 0,
        untrustedPendingSats: 0,
        immatureSats: 0,
        totalSats: 0,
      },
      transactions: [],
    })
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(isoTimestamp)
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(true)
    expect(result.lastSuccessfulEsploraSyncAt).toBe(isoTimestamp)
  })

  it('returns stale when balance is not hydrated yet but session is unlocked', async () => {
    useWalletStore.setState({
      balance: null,
      transactions: [],
    })
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(isoTimestamp)
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(true)
    expect(result.lastSuccessfulEsploraSyncAt).toBe(isoTimestamp)
  })
})

describe('removeOnchainDashboardQueries', () => {
  it('removes cached onchain dashboard query entries', () => {
    removeOnchainDashboardQueries()
    expect(removeQueriesMock).toHaveBeenCalledWith({
      queryKey: ONCHAIN_DASHBOARD_QUERY_KEY,
    })
  })
})
