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
const walletSecretsSessionState = { active: false }
vi.mock('@/lib/wallet/wallet-secrets-session', () => ({
  isWalletSecretsSessionActive: async () => walletSecretsSessionState.active,
}))

const loadDescriptorWalletAndSync = vi.fn()
const loadDescriptorWalletWithoutSync = vi.fn()

vi.mock('@/lib/wallet/wallet-utils', () => ({
  loadDescriptorWalletAndSync: (...args: unknown[]) =>
    loadDescriptorWalletAndSync(...args),
  loadDescriptorWalletWithoutSync: (...args: unknown[]) =>
    loadDescriptorWalletWithoutSync(...args),
}))

vi.mock('@/workers/crypto-factory', () => ({
  waitForCryptoWorkerHealthy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/wallet-sync-error-toast', () => ({
  reportWalletSyncError: vi.fn(),
}))

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
    walletSecretsSessionState.active = false
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: null,
      walletStatus: 'none',
      manualWalletUnlockInFlight: false,
      activeWalletBootstrapInFlight: false,
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
      manualWalletUnlockInFlight: true,
    })
    walletSecretsSessionState.active = true

    renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 80))
    expect(loadDescriptorWalletAndSync).not.toHaveBeenCalled()
    expect(loadDescriptorWalletWithoutSync).not.toHaveBeenCalled()
  })

  it('runs bootstrap when session exists, wallet locked, and manual unlock is not in flight', async () => {
    useWalletStore.setState({
      activeWalletId: 1,
      walletStatus: 'locked',
      manualWalletUnlockInFlight: false,
    })
    walletSecretsSessionState.active = true
    loadDescriptorWalletAndSync.mockResolvedValue(undefined)

    renderHook(() => useActiveWalletLoadQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(loadDescriptorWalletAndSync).toHaveBeenCalledTimes(1)
    })
  })
})
