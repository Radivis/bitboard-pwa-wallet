import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLabStore } from '@/stores/labStore'

export type LabMineBlocksVariables = {
  count: number
  effectiveTarget: string
  mineOptions:
    | { ownerWalletId: number }
    | { ownerName: string }
    | undefined
}

function formatLabError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err) || 'Unknown error'
}

/**
 * Mines blocks in the lab worker; updates lab Zustand state on success.
 */
export function useLabMineBlocksMutation() {
  return useMutation({
    mutationKey: ['lab', 'mineBlocks'] as const,
    mutationFn: async (variables: LabMineBlocksVariables) => {
      return useLabStore
        .getState()
        .mineBlocks(
          variables.count,
          variables.effectiveTarget,
          variables.mineOptions,
        )
    },
    onSuccess: (_data, variables) => {
      toast.success(`Mined ${variables.count} block(s)`)
    },
    onError: (err) => {
      console.error('Mining failed:', err)
      toast.error(`Mining failed: ${formatLabError(err)}`)
    },
  })
}

export type LabCreateTransactionVariables = {
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
}

/**
 * Creates a lab mempool transaction; updates lab Zustand state on success.
 */
export function useLabCreateTransactionMutation() {
  return useMutation({
    mutationKey: ['lab', 'createTransaction'] as const,
    mutationFn: async (variables: LabCreateTransactionVariables) => {
      return useLabStore.getState().createLabTransaction(
        variables.fromAddress,
        variables.toAddress,
        variables.amountSats,
        variables.feeRateSatPerVb,
      )
    },
    onSuccess: () => {
      toast.success('Transaction added to mempool')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    },
  })
}

/**
 * Resets lab chain state to empty; updates lab Zustand on success.
 */
export function useLabResetMutation() {
  const resetLabStore = useLabStore((s) => s.reset)

  return useMutation({
    mutationKey: ['lab', 'reset'] as const,
    mutationFn: () => resetLabStore(),
    onSuccess: () => {
      toast.success('Lab reset')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    },
  })
}
