import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
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

function renderExitFlow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderHook(() => useCollaborativeExitFlow(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

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
    renderExitFlow()

    expect(feeQueryCalls[0]?.destinationAddress).toBe('bcrt1qtest')
  })

  it('returns to management after a successful submit', () => {
    const { result } = renderExitFlow()

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

    renderExitFlow()

    expect(navigate).toHaveBeenCalledWith({ to: '/wallet/management' })
  })
})
