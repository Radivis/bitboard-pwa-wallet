import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLabMineBlocksMutation } from '@/hooks/useLabMutations'
import { EMPTY_LAB_STATE, type LabMineBlocksResult } from '@/workers/lab-api'

const labOpMineBlocks = vi.hoisted(() => vi.fn())

vi.mock('@/lib/lab-worker-operations', () => ({
  labOpMineBlocks,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

describe('useLabMineBlocksMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success omits mempool tx phrase when included is 0', async () => {
    const payload: LabMineBlocksResult = {
      state: EMPTY_LAB_STATE,
      includedMempoolTxCount: 0,
      discardedConflictTxCount: 0,
    }
    labOpMineBlocks.mockResolvedValue(payload)
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useLabMineBlocksMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        count: 2,
        effectiveTarget: '',
        mineOptions: undefined,
        labAddressType: 'segwit',
      })
    })

    expect(toast.success).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(toast.success).mock.calls[0][0] as string
    expect(msg).toBe('Mined 2 block(s)')
    expect(msg.toLowerCase()).not.toContain('mempool')
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('success includes mempool tx count when included > 0', async () => {
    const payload: LabMineBlocksResult = {
      state: EMPTY_LAB_STATE,
      includedMempoolTxCount: 3,
      discardedConflictTxCount: 0,
    }
    labOpMineBlocks.mockResolvedValue(payload)
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useLabMineBlocksMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        count: 1,
        effectiveTarget: '',
        mineOptions: undefined,
        labAddressType: 'segwit',
      })
    })

    expect(toast.success).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(toast.success).mock.calls[0][0] as string
    expect(msg).toContain('Mined 1 block(s)')
    expect(msg).toContain('Included 3 transactions from the mempool.')
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('uses singular transaction when included count is 1', async () => {
    const payload: LabMineBlocksResult = {
      state: EMPTY_LAB_STATE,
      includedMempoolTxCount: 1,
      discardedConflictTxCount: 0,
    }
    labOpMineBlocks.mockResolvedValue(payload)
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useLabMineBlocksMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        count: 1,
        effectiveTarget: '',
        mineOptions: undefined,
        labAddressType: 'segwit',
      })
    })

    const msg = vi.mocked(toast.success).mock.calls[0][0] as string
    expect(msg).toContain('Included 1 transaction from the mempool.')
  })

  it('warns when discarded conflict count > 0', async () => {
    const payload: LabMineBlocksResult = {
      state: EMPTY_LAB_STATE,
      includedMempoolTxCount: 1,
      discardedConflictTxCount: 2,
    }
    labOpMineBlocks.mockResolvedValue(payload)
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useLabMineBlocksMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        count: 1,
        effectiveTarget: '',
        mineOptions: undefined,
        labAddressType: 'segwit',
      })
    })

    expect(toast.warning).toHaveBeenCalledTimes(1)
    const warnMsg = vi.mocked(toast.warning).mock.calls[0][0] as string
    expect(warnMsg).toContain('2 transactions discarded')
    expect(warnMsg.toLowerCase()).toContain('double-spend')
  })

  it('uses singular transaction in warning when discarded count is 1', async () => {
    const payload: LabMineBlocksResult = {
      state: EMPTY_LAB_STATE,
      includedMempoolTxCount: 0,
      discardedConflictTxCount: 1,
    }
    labOpMineBlocks.mockResolvedValue(payload)
    const { wrapper } = createTestWrapper()
    const { result } = renderHook(() => useLabMineBlocksMutation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        count: 1,
        effectiveTarget: '',
        mineOptions: undefined,
        labAddressType: 'segwit',
      })
    })

    const warnMsg = vi.mocked(toast.warning).mock.calls[0][0] as string
    expect(warnMsg).toContain('1 transaction discarded')
  })
})
