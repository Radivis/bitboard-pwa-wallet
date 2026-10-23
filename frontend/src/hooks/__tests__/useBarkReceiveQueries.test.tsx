import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useBarkReceiveAddressQuery,
  useBarkRevealReceiveAddressMutation,
} from '@/hooks/useBarkReceiveQueries'
import { createTestQueryClient } from '@/test-utils/test-providers'
import { useFeatureStore } from '@/stores/featureStore'
import { useWalletStore } from '@/stores/walletStore'
import {
  getBarkLoadLifecycleSnapshot,
  replaceBarkLoadLifecycleSnapshotForTests,
  resetBarkLoadLifecycleStateForTests,
} from '@/lib/wallet/lifecycle/bark-load-lifecycle-orchestrator'

const workerMocks = vi.hoisted(() => ({
  peekReceiveAddress: vi.fn(),
  revealNextReceiveAddress: vi.fn(),
}))

vi.mock('@/workers/bark-factory', () => ({
  getBarkWorker: () => workerMocks,
}))

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useBarkReceiveAddressQuery', () => {
  beforeEach(() => {
    resetBarkLoadLifecycleStateForTests()
    useFeatureStore.setState({ isBarkEnabled: true })
    useWalletStore.setState({ activeWalletId: 1, networkMode: 'signet' })
    workerMocks.peekReceiveAddress.mockReset()
    workerMocks.revealNextReceiveAddress.mockReset()
    workerMocks.peekReceiveAddress.mockResolvedValue('tark1qqpeek')
    workerMocks.revealNextReceiveAddress.mockResolvedValue({
      address: 'tark1qqnext',
      index: 1,
    })
    replaceBarkLoadLifecycleSnapshotForTests({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 2,
    })
  })

  it('peeks the stored index and does not reveal on render or rerender', async () => {
    const { result, rerender } = renderHook(() => useBarkReceiveAddressQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toBe('tark1qqpeek')
    })
    rerender()

    expect(workerMocks.peekReceiveAddress).toHaveBeenCalledWith(2)
    expect(workerMocks.revealNextReceiveAddress).not.toHaveBeenCalled()
  })

  it('does not peek or reveal when the receive index is missing', () => {
    replaceBarkLoadLifecycleSnapshotForTests({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: null,
    })
    renderHook(() => useBarkReceiveAddressQuery(), { wrapper: createWrapper() })
    expect(workerMocks.peekReceiveAddress).not.toHaveBeenCalled()
    expect(workerMocks.revealNextReceiveAddress).not.toHaveBeenCalled()
  })
})

describe('useBarkRevealReceiveAddressMutation', () => {
  beforeEach(() => {
    resetBarkLoadLifecycleStateForTests()
    useFeatureStore.setState({ isBarkEnabled: true })
    useWalletStore.setState({ activeWalletId: 1, networkMode: 'signet' })
    workerMocks.revealNextReceiveAddress.mockReset()
    workerMocks.revealNextReceiveAddress.mockResolvedValue({
      address: 'tark1qqnext',
      index: 1,
    })
    replaceBarkLoadLifecycleSnapshotForTests({
      loadPhase: 'loaded',
      networkMode: 'signet',
      errorMessage: null,
      receiveKeyIndex: 0,
    })
  })

  it('calls reveal once and keeps the new index', async () => {
    const { result } = renderHook(() => useBarkRevealReceiveAddressMutation(), {
      wrapper: createWrapper(),
    })
    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(workerMocks.revealNextReceiveAddress).toHaveBeenCalledTimes(1)
    expect(getBarkLoadLifecycleSnapshot().receiveKeyIndex).toBe(1)
  })
})
