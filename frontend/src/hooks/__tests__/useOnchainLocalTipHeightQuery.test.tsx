import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type ReactNode } from '@tanstack/react-query'

import { bdkChangesetJson } from '@/test-utils/bdk-changeset-json-fixtures'
import { useWalletStore } from '@/stores/walletStore'
import type { TransactionDetails } from '@/workers/crypto-types'

const exportChangeset = vi.hoisted(() => vi.fn())

vi.mock('@/stores/cryptoStore', () => ({
  useCryptoStore: {
    getState: () => ({ exportChangeset }),
  },
}))

import { useOnchainLocalTipHeightQuery } from '@/hooks/useOnchainLocalTipHeightQuery'

const confirmedTransaction: TransactionDetails = {
  txid: 'aa',
  sentSats: 0,
  receivedSats: 1,
  feeSats: null,
  confirmationBlockHeight: 100,
  confirmationTime: 1,
  isConfirmed: true,
  isLabTx: false,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOnchainLocalTipHeightQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      networkMode: 'signet',
      activeWalletId: 1,
      transactions: [confirmedTransaction],
    })
    exportChangeset.mockResolvedValue(bdkChangesetJson({ blockHeights: [150] }))
  })

  it('reads the local tip from the loaded wallet changeset', async () => {
    const { result } = renderHook(() => useOnchainLocalTipHeightQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toBe(150)
    })
    expect(exportChangeset).toHaveBeenCalledTimes(1)
  })

  it('does not export a changeset on lab', async () => {
    useWalletStore.setState({ networkMode: 'lab' })

    renderHook(() => useOnchainLocalTipHeightQuery(), { wrapper: createWrapper() })

    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    expect(exportChangeset).not.toHaveBeenCalled()
  })

  it('reports an unknown tip when the changeset cannot be exported', async () => {
    exportChangeset.mockRejectedValue(new Error('wallet locked'))

    const { result } = renderHook(() => useOnchainLocalTipHeightQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('reads the tip again when the transaction list is replaced', async () => {
    const { result } = renderHook(() => useOnchainLocalTipHeightQuery(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => {
      expect(result.current.data).toBe(150)
    })

    exportChangeset.mockResolvedValue(bdkChangesetJson({ blockHeights: [180] }))
    act(() => {
      useWalletStore.setState({ transactions: [{ ...confirmedTransaction }] })
    })

    await waitFor(() => {
      expect(result.current.data).toBe(180)
    })
    expect(exportChangeset).toHaveBeenCalledTimes(2)
  })
})
