import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLayoutEffect, type ReactNode } from 'react'
import { useActiveWalletLoadQuery } from '@/hooks/useActiveWalletLoadQuery'
import { AddressType, useWalletStore } from '@/stores/walletStore'
import { useWalletCryptoSessionPathGateStore } from '@/stores/walletCryptoSessionPathGateStore'
import {
  orchestrateManualUnlock,
  resetLockLifecycleStateForTests,
  syncLockLifecycleWithActiveWallet,
} from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const orchestrateOnchainLoad = vi.fn()

const walletSecretsSessionState = { active: false }

vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: vi.fn(async () => walletSecretsSessionState.active),
  ensureWalletSecretsSession: vi.fn(async () => {
    walletSecretsSessionState.active = true
  }),
  endWalletSecretsSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-load-lifecycle-orchestrator', () => ({
  orchestrateOnchainLoad: (...args: unknown[]) => orchestrateOnchainLoad(...args),
}))

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  orchestrateArkadeLoad: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator', () => ({
  orchestrateLightningLoad: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/wallet/lifecycle/onchain-sync-lifecycle-orchestrator')
  >()
  return {
    ...actual,
    orchestrateOnchainPostUnlockSync: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: vi.fn().mockResolvedValue(undefined),
}))

function createWrapper(queryClient: QueryClient, pathname = '/wallet') {
  useWalletCryptoSessionPathGateStore.getState().setPathname(pathname)
  return function Wrapper({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      useWalletCryptoSessionPathGateStore.getState().setPathname(pathname)
    }, [])
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useActiveWalletLoadQuery lock lifecycle reactivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    walletSecretsSessionState.active = false
    orchestrateOnchainLoad.mockImplementation(
      () => new Promise<void>(() => {
        /* keep manual unlock in flight */
      }),
    )
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: 1,
      walletStatus: 'locked',
      balance: null,
      currentAddress: null,
      lastSyncTime: null,
      transactions: [],
      loadedDescriptorWallet: null,
      importInitialSyncErrorMessage: null,
    })
    syncLockLifecycleWithActiveWallet(1)
  })

  it('disables bootstrap as soon as manual unlock starts, without a wallet store update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result } = renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(result.current.needsBootstrap).toBe(true)
    })

    void orchestrateManualUnlock({
      walletId: 1,
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      password: 'secret',
    })

    await waitFor(() => {
      expect(result.current.needsBootstrap).toBe(false)
    })
  })
})
