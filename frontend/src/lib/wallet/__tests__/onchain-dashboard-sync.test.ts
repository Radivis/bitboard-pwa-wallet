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
import { useSessionStore } from '@/stores/sessionStore'
import { resolveOnchainEsploraSyncMetadata } from '@/lib/wallet/onchain-dashboard-sync'

describe('resolveOnchainEsploraSyncMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ password: 'pw' })
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
    useWalletStore.setState({ lastSyncTime: new Date() })
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(false)
    expect(loadLastSuccessfulEsploraSyncAtForDescriptorWallet).not.toHaveBeenCalled()
  })

  it('returns stale when BDK data exists and persisted Esplora sync timestamp exists', async () => {
    const isoTimestamp = '2020-01-02T00:00:00.000Z'
    loadLastSuccessfulEsploraSyncAtForDescriptorWallet.mockResolvedValue(isoTimestamp)
    const result = await resolveOnchainEsploraSyncMetadata()
    expect(result.isStaleOnchain).toBe(true)
    expect(result.lastSuccessfulEsploraSyncAt).toBe(isoTimestamp)
  })
})
