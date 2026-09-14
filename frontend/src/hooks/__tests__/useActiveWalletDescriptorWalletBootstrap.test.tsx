import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, type ReactNode } from 'react'
import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'
import { AddressType, useWalletStore } from '@/stores/walletStore'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import { activeWalletLoadQueryKey } from '@/lib/wallet/wallet-load-query-keys'
import {
  resetLockLifecycleStateForTests,
  syncLockLifecycleWithActiveWallet,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const { walletSecretsSessionState, orchestrateBootstrapUnlock } = vi.hoisted(() => ({
  walletSecretsSessionState: { active: true },
  orchestrateBootstrapUnlock: vi.fn(),
}))

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: async () => walletSecretsSessionState.active,
}))

vi.mock('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/lock-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateBootstrapUnlock: (...args: unknown[]) => orchestrateBootstrapUnlock(...args),
  }
})

function createWrapper(queryClient: QueryClient) {
  useWalletCryptoSessionPathGateStore.getState().setPathname('/wallet')
  return function Wrapper({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      useWalletCryptoSessionPathGateStore.getState().setPathname('/wallet')
    }, [])
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useActiveWalletDescriptorWalletBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    walletSecretsSessionState.active = true
    orchestrateBootstrapUnlock.mockResolvedValue(undefined)
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: 1,
      walletStatus: 'unlocked',
      balance: null,
      currentAddress: null,
      lastSyncTime: null,
      transactions: [],
      loadedDescriptorWallet: null,
      importInitialSyncErrorMessage: null,
    })
    syncLockLifecycleWithActiveWallet(1)
  })

  it('clears a successful load cache on lock even when a secrets session is active', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const bootstrapQueryKey = activeWalletLoadQueryKey({
      activeWalletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      lockUnlockInProgress: false,
    })
    queryClient.setQueryData(bootstrapQueryKey, true)

    const { rerender } = renderHook(
      () => useActiveWalletDescriptorWalletBootstrap(),
      { wrapper: createWrapper(queryClient) },
    )

    expect(queryClient.getQueryData(bootstrapQueryKey)).toBe(true)

    await act(async () => {
      useWalletStore.setState({ walletStatus: 'locked' })
      rerender()
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(bootstrapQueryKey)).toBeUndefined()
    })
  })
})
