import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'
import {
  useWalletStore,
  AddressType,
} from '@/stores/walletStore'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import {
  resetLockLifecycleStateForTests,
  syncLockLifecycleWithActiveWallet,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const walletSecretsSessionState = { active: false }
const orchestrateBootstrapUnlock = vi.fn()
const canStartBootstrapUnlock = vi.fn()

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
    canStartBootstrapUnlock: () => canStartBootstrapUnlock(),
  }
})

function createWrapper(pathname = '/wallet') {
  useWalletCryptoSessionPathGateStore.getState().setPathname(pathname)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      useWalletCryptoSessionPathGateStore.getState().setPathname(pathname)
    }, [])
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useActiveWalletLoadQuery', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    useWalletCryptoSessionPathGateStore.getState().setPathname('/wallet')
    walletSecretsSessionState.active = false
    orchestrateBootstrapUnlock.mockResolvedValue(undefined)
    canStartBootstrapUnlock.mockReturnValue(true)
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: null,
      walletStatus: 'none',
      balance: null,
      currentAddress: null,
      lastSyncTime: null,
      transactions: [],
      loadedDescriptorWallet: null,
      importInitialSyncErrorMessage: null,
    })
  })

  it('does not enable bootstrap while manual wallet unlock is in flight', async () => {
    useWalletStore.setState({
      activeWalletId: 1,
      walletStatus: 'locked',
    })
    syncLockLifecycleWithActiveWallet(1)
    canStartBootstrapUnlock.mockReturnValue(false)
    walletSecretsSessionState.active = true

    renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 80))
    expect(orchestrateBootstrapUnlock).not.toHaveBeenCalled()
  })

  it('runs bootstrap when session exists, wallet locked, and manual unlock is not in flight', async () => {
    useWalletStore.setState({
      activeWalletId: 1,
      walletStatus: 'locked',
    })
    syncLockLifecycleWithActiveWallet(1)
    walletSecretsSessionState.active = true

    renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper('/wallet'),
    })

    await waitFor(() => {
      expect(orchestrateBootstrapUnlock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not bootstrap on settings when wallet is locked and session exists', async () => {
    useWalletStore.setState({
      activeWalletId: 1,
      walletStatus: 'locked',
    })
    syncLockLifecycleWithActiveWallet(1)
    walletSecretsSessionState.active = true

    renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper('/settings'),
    })

    await new Promise((r) => setTimeout(r, 80))
    expect(orchestrateBootstrapUnlock).not.toHaveBeenCalled()
  })

  it('keeps bootstrap enabled when leaving wallet route during lockUnlockInProgress', async () => {
    useWalletStore.setState({
      activeWalletId: 1,
      walletStatus: 'locked',
    })
    syncLockLifecycleWithActiveWallet(1)
    walletSecretsSessionState.active = true

    let resolveBootstrap: (() => void) | undefined
    orchestrateBootstrapUnlock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveBootstrap = resolve
        }),
    )

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    function Wrapper({ children }: { children: ReactNode }) {
      const [pathname, setPathname] = useState('/wallet')
      useLayoutEffect(() => {
        useWalletCryptoSessionPathGateStore.getState().setPathname(pathname)
      }, [pathname])
      useLayoutEffect(() => {
        const timer = window.setTimeout(() => setPathname('/library'), 20)
        return () => window.clearTimeout(timer)
      }, [])
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
    }

    renderHook(() => useActiveWalletLoadQuery(), { wrapper: Wrapper })

    await waitFor(() => {
      expect(orchestrateBootstrapUnlock).toHaveBeenCalledTimes(1)
    })

    resolveBootstrap?.()
  })
})
