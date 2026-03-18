import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  labOpCreateTransaction,
  labOpMineBlocks,
  labOpReset,
} from '@/lib/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'

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

export function useLabMineBlocksMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'mineBlocks'] as const,
    mutationFn: async (variables: LabMineBlocksVariables) => {
      return labOpMineBlocks(
        variables.count,
        variables.effectiveTarget,
        variables.mineOptions,
      )
    },
    onSuccess: (state, variables) => {
      setLabChainStateCache(queryClient, state)
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

export function useLabCreateTransactionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'createTransaction'] as const,
    mutationFn: async (variables: LabCreateTransactionVariables) => {
      return labOpCreateTransaction(
        variables.fromAddress,
        variables.toAddress,
        variables.amountSats,
        variables.feeRateSatPerVb,
      )
    },
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      toast.success('Transaction added to mempool')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Transaction failed')
    },
  })
}

export function useLabResetMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'reset'] as const,
    mutationFn: () => labOpReset(),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      toast.success('Lab reset')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    },
  })
}
