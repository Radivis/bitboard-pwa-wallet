import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWalletStore } from '@/stores/walletStore'
import { ARKADE_INTENT_LIFECYCLE_PHASES } from '@/lib/arkade/arkade-pending-batch-intent'

const navigate = vi.hoisted(() => vi.fn())
const mutate = vi.hoisted(() =>
  vi.fn((_params: unknown, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.()
  }),
)
const pendingBatchIntents = vi.hoisted(() => ({ current: [] as unknown[] }))
const feeQueryCalls = vi.hoisted(
  () => [] as Array<{ destinationAddress: string; amountSats?: number }>,
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/hooks/useArkadeQueries', () => ({
  useArkadeBalanceQuery: () => ({ data: { confirmedSats: 100_000, totalSats: 100_000 } }),
  useArkadeCollaborativeExitFeeQuery: (params: {
    destinationAddress: string
    amountSats?: number
  }) => {
    feeQueryCalls.push({
      destinationAddress: params.destinationAddress,
      amountSats: params.amountSats,
    })
    return { isLoading: false, isError: false, data: undefined }
  },
  useArkadeCollaborativeExitMutation: () => ({ mutate, isPending: false }),
  useHasPendingBatchIntent: () => false,
  useHasPendingBatchIntentKind: () => false,
  usePendingBatchIntents: () => pendingBatchIntents.current,
}))

import { useCollaborativeExitFlow } from '@/hooks/useCollaborativeExitFlow'

describe('useCollaborativeExitFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingBatchIntents.current = []
    feeQueryCalls.length = 0
    useWalletStore.setState({
      networkMode: 'regtest',
      currentAddress: 'bcrt1qtest',
      arkadeSignerMigrationHint: null,
    })
  })

  it('quotes the fee for the current receive address on the first render', () => {
    renderHook(() => useCollaborativeExitFlow())

    expect(feeQueryCalls[0]?.destinationAddress).toBe('bcrt1qtest')
  })

  it('returns to management after a successful submit', () => {
    const { result } = renderHook(() => useCollaborativeExitFlow())

    result.current.handleCollaborativeExit()

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationAddress: 'bcrt1qtest',
      }),
      expect.any(Object),
    )
    expect(navigate).toHaveBeenCalledWith({ to: '/wallet/management' })
  })

  it('returns to management when a collaborative intent is processing', () => {
    pendingBatchIntents.current = [
      {
        kind: 'collaborative_exit',
        lifecyclePhase: ARKADE_INTENT_LIFECYCLE_PHASES.processing,
      },
    ]

    renderHook(() => useCollaborativeExitFlow())

    expect(navigate).toHaveBeenCalledWith({ to: '/wallet/management' })
  })
})
