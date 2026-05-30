import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MANUAL_UTXO_REBUILD_DEBOUNCE_MS,
  useManualUtxoSelectionRebuild,
} from '@/hooks/useManualUtxoSelectionRebuild'
import type { ReviewInputUtxo } from '@/workers/crypto-api'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

const sampleUtxo: ReviewInputUtxo = {
  address: 'tb1qtest',
  amountSats: 50_000,
  txid: 'abc123',
  vout: 0,
}

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper }
}

describe('useManualUtxoSelectionRebuild', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not rebuild when selection revision is zero', async () => {
    const onRebuild = vi.fn().mockResolvedValue(undefined)
    const { wrapper } = createTestWrapper()

    renderHook(
      () =>
        useManualUtxoSelectionRebuild({
          manualSelectionEnabled: true,
          localSelectedUtxos: [sampleUtxo],
          selectionRevision: 0,
          onRebuildWithSelectedUtxos: onRebuild,
        }),
      { wrapper },
    )

    await act(async () => {
      vi.advanceTimersByTime(MANUAL_UTXO_REBUILD_DEBOUNCE_MS + 50)
    })

    expect(onRebuild).not.toHaveBeenCalled()
  })

  it('does not rebuild when local selection is empty', async () => {
    const onRebuild = vi.fn().mockResolvedValue(undefined)
    const { wrapper } = createTestWrapper()

    renderHook(
      () =>
        useManualUtxoSelectionRebuild({
          manualSelectionEnabled: true,
          localSelectedUtxos: [],
          selectionRevision: 2,
          onRebuildWithSelectedUtxos: onRebuild,
        }),
      { wrapper },
    )

    await act(async () => {
      vi.advanceTimersByTime(MANUAL_UTXO_REBUILD_DEBOUNCE_MS + 50)
    })

    expect(onRebuild).not.toHaveBeenCalled()
  })

  it('debounces rebuild after selection revision changes', async () => {
    vi.useRealTimers()
    const onRebuild = vi.fn().mockResolvedValue(undefined)
    const { wrapper } = createTestWrapper()

    renderHook(
      () =>
        useManualUtxoSelectionRebuild({
          manualSelectionEnabled: true,
          localSelectedUtxos: [sampleUtxo],
          selectionRevision: 1,
          onRebuildWithSelectedUtxos: onRebuild,
        }),
      { wrapper },
    )

    await new Promise((resolve) => {
      setTimeout(resolve, MANUAL_UTXO_REBUILD_DEBOUNCE_MS - 20)
    })
    expect(onRebuild).not.toHaveBeenCalled()

    await waitFor(
      () => {
        expect(onRebuild).toHaveBeenCalledTimes(1)
      },
      { timeout: MANUAL_UTXO_REBUILD_DEBOUNCE_MS + 200 },
    )
    expect(onRebuild).toHaveBeenCalledWith([sampleUtxo])
  })

  it('shows toast when rebuild fails', async () => {
    vi.useRealTimers()
    const onRebuild = vi.fn().mockRejectedValue(new Error('prepare failed'))
    const { wrapper } = createTestWrapper()

    renderHook(
      () =>
        useManualUtxoSelectionRebuild({
          manualSelectionEnabled: true,
          localSelectedUtxos: [sampleUtxo],
          selectionRevision: 1,
          onRebuildWithSelectedUtxos: onRebuild,
        }),
      { wrapper },
    )

    await waitFor(
      () => {
        expect(toast.error).toHaveBeenCalledWith('prepare failed')
      },
      { timeout: MANUAL_UTXO_REBUILD_DEBOUNCE_MS + 500 },
    )
  })
})
