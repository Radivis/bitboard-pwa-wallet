import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, type ReactNode } from 'react'
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
    isLockUnlockInProgress: actual.isLockUnlockInProgress,
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      useWalletCryptoSessionPathGateStore.getState().setPathname('/wallet')
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
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(orchestrateBootstrapUnlock).toHaveBeenCalledTimes(1)
    })
  })
})
