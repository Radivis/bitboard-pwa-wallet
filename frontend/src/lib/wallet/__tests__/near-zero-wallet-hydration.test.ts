import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { AddressType, useWalletStore } from '@/stores/walletStore'
import { activeWalletLoadQueryKey, walletSecretsSessionProbeQueryKeyPrefix } from '@/lib/wallet/wallet-load-query-keys'
import { hydrateNearZeroSessionForWalletRoute } from '@/lib/wallet/near-zero-wallet-hydration'

const tryLoadNearZeroSessionIntoMemory = vi.fn()

vi.mock('@/db', () => ({
  getDatabase: () => ({}),
  tryLoadNearZeroSessionIntoMemory: (...args: unknown[]) =>
    tryLoadNearZeroSessionIntoMemory(...args),
}))

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

describe('hydrateNearZeroSessionForWalletRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tryLoadNearZeroSessionIntoMemory.mockResolvedValue(true)
    useWalletStore.setState({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      walletStatus: 'locked',
    })
  })

  it('invalidates the session probe after restore', async () => {
    const queryClient = createQueryClient()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    await hydrateNearZeroSessionForWalletRoute(queryClient)

    expect(tryLoadNearZeroSessionIntoMemory).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [...walletSecretsSessionProbeQueryKeyPrefix],
      }),
    )
  })

  it('clears a stale bootstrap success while still gated', async () => {
    const queryClient = createQueryClient()
    const bootstrapQueryKey = activeWalletLoadQueryKey({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      lockUnlockInProgress: false,
    })
    queryClient.setQueryData(bootstrapQueryKey, true)

    await hydrateNearZeroSessionForWalletRoute(queryClient)

    expect(queryClient.getQueryData(bootstrapQueryKey)).toBeUndefined()
  })
})
