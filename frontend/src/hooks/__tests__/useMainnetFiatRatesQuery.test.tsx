import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type ReactNode } from '@tanstack/react-query'
import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useWalletStore } from '@/stores/walletStore'

const lightningBalancesQueryMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { totalSats: 0 } })),
)

vi.mock('@/hooks/useLightningMutations', () => ({
  useLightningBalancesForDashboardQuery: () => lightningBalancesQueryMock(),
}))

const emptyOnchainBalance = {
  confirmedSats: 0,
  trustedPendingSats: 0,
  untrustedPendingSats: 0,
  immatureSats: 0,
  totalSats: 0,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useMainnetFiatRatesQuery', () => {
  beforeEach(() => {
    lightningBalancesQueryMock.mockReturnValue({ data: { totalSats: 0 } })
    useWalletStore.setState({
      networkMode: 'mainnet',
      walletStatus: 'unlocked',
      balance: emptyOnchainBalance,
      arkadeBalance: null,
    })
    useFiatDenominationStore.setState({ fiatDenominationMode: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
  })

  it('starts fetching when only Arkade balance is positive', async () => {
    useWalletStore.setState({
      arkadeBalance: {
        confirmedSats: 50_000,
        totalSats: 50_000,
      },
    })

    const { result } = renderHook(() => useMainnetFiatRatesQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('fetching')
    })
  })

  it('does not fetch when on-chain, Lightning, and Arkade balances are all zero', () => {
    const { result } = renderHook(() => useMainnetFiatRatesQuery(), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()
  })
})
