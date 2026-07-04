import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useActiveWalletDescriptorWalletBootstrap } from '@/hooks/useActiveWalletDescriptorWalletBootstrap'
import { AddressType, useWalletStore } from '@/stores/walletStore'
import { resetLockLifecycleStateForTests } from '@/lib/wallet/lifecycle/lock-lifecycle-orchestrator'

const useActiveWalletLoadQuery = vi.fn()

vi.mock('@/hooks/useActiveWalletLoadQuery', () => ({
  useActiveWalletLoadQuery: () => useActiveWalletLoadQuery(),
}))

function createWrapper() {
  const queryClient = new QueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useActiveWalletDescriptorWalletBootstrap', () => {
  const setWalletStatus = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    resetLockLifecycleStateForTests()
    useWalletStore.setState({
      networkMode: 'testnet',
      addressType: AddressType.Taproot,
      accountId: 0,
      activeWalletId: 1,
      walletStatus: 'unlocked',
      setWalletStatus,
    })
    useActiveWalletLoadQuery.mockReturnValue({
      isError: true,
      needsBootstrap: false,
    })
  })

  it('does not re-lock when bootstrap query errors but wallet is already unlocked', () => {
    renderHook(() => useActiveWalletDescriptorWalletBootstrap(), {
      wrapper: createWrapper(),
    })

    expect(setWalletStatus).not.toHaveBeenCalled()
  })
})
