import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  labOpCreateTransaction,
  labOpMineBlocks,
  labOpReset,
} from '@/lib/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'
import { errorMessage } from '@/lib/utils'

export type LabMineBlocksVariables = {
  count: number
  effectiveTarget: string
  mineOptions:
    | { ownerWalletId: number }
    | { ownerName: string }
    | undefined
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
      toast.error(`Mining failed: ${errorMessage(err)}`)
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
      return labOpCreateTransaction({
        fromAddress: variables.fromAddress,
        toAddress: variables.toAddress,
        amountSats: variables.amountSats,
        feeRateSatPerVb: variables.feeRateSatPerVb,
      })
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
      toast.error(errorMessage(err) || 'Reset failed')
    },
  })
}
