import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type ReactNode } from '@tanstack/react-query'
import { useWalletStore } from '@/stores/walletStore'

const runIncrementalDashboardWalletSync = vi.hoisted(() => vi.fn())
const usePeriodicSyncRefetchInterval = vi.hoisted(() => vi.fn())
const useIsOnchainRailLoaded = vi.hoisted(() => vi.fn())
const getActiveDescriptorWalletKey = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/wallet-utils', () => ({
  runIncrementalDashboardWalletSync: (...args: unknown[]) =>
    runIncrementalDashboardWalletSync(...args),
}))

vi.mock('@/lib/wallet/periodic-sync/usePeriodicSyncRefetchInterval', () => ({
  usePeriodicSyncRefetchInterval: (...args: unknown[]) =>
    usePeriodicSyncRefetchInterval(...args),
}))

vi.mock('@/hooks/useOnchainLifecycleSnapshots', () => ({
  useIsOnchainRailLoaded: () => useIsOnchainRailLoaded(),
}))

vi.mock('@/lib/wallet/onchain-dashboard-sync', () => ({
  getActiveDescriptorWalletKey: () => getActiveDescriptorWalletKey(),
}))

import { useOnchainPeriodicSyncQuery } from '@/hooks/useOnchainPeriodicSyncQuery'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOnchainPeriodicSyncQuery PER-SYNC-20', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      networkMode: 'signet',
      activeWalletId: 1,
    })
    useIsOnchainRailLoaded.mockReturnValue(true)
    getActiveDescriptorWalletKey.mockReturnValue('signet:taproot:0')
    runIncrementalDashboardWalletSync.mockResolvedValue(undefined)
  })

  it('does not run queryFn when periodic sync is off', async () => {
    usePeriodicSyncRefetchInterval.mockReturnValue(false)

    await act(async () => {
      renderHook(() => useOnchainPeriodicSyncQuery(), { wrapper: createWrapper() })
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
    })

    expect(runIncrementalDashboardWalletSync).not.toHaveBeenCalled()
  })

  it('runs queryFn when periodic sync is on and rail loaded', async () => {
    usePeriodicSyncRefetchInterval.mockReturnValue(300_000)

    renderHook(() => useOnchainPeriodicSyncQuery(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(runIncrementalDashboardWalletSync).toHaveBeenCalledWith({
        networkMode: 'signet',
        activeWalletId: 1,
      })
    })
  })
})
