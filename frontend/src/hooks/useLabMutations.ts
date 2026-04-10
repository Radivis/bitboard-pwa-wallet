import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  labOpCreateLabEntityTransaction,
  labOpCreateRandomLabEntityTransactions,
  labOpMineBlocks,
  labOpReset,
} from '@/lib/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'
import { labChainStateQueryKey } from '@/lib/lab-chain-query'
import { errorMessage } from '@/lib/utils'

export type LabMineBlocksVariables = {
  count: number
  effectiveTarget: string
  mineOptions:
    | { ownerWalletId: number }
    | { ownerName: string }
    | undefined
  labAddressType: 'segwit' | 'taproot'
  labNetwork?: string
}

export function useLabMineBlocksMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'mineBlocks'] as const,
    mutationFn: async (variables: LabMineBlocksVariables) => {
      return labOpMineBlocks(variables.count, variables.effectiveTarget, {
        ...variables.mineOptions,
        labAddressType: variables.labAddressType,
        labNetwork: variables.labNetwork ?? 'regtest',
      })
    },
    onSuccess: (result, variables) => {
      setLabChainStateCache(queryClient, result.state)
      const blocksPhrase = `Mined ${variables.count} block(s)`
      const successMessage =
        result.includedMempoolTxCount > 0
          ? `${blocksPhrase}. Included ${result.includedMempoolTxCount} transaction${
              result.includedMempoolTxCount === 1 ? '' : 's'
            } from the mempool.`
          : blocksPhrase
      toast.success(successMessage)
      if (result.discardedConflictTxCount > 0) {
        toast.warning(
          `${result.discardedConflictTxCount} transaction${
            result.discardedConflictTxCount === 1 ? '' : 's'
          } discarded from the mempool due to double-spend conflicts.`,
        )
      }
    },
    onError: (err) => {
      console.error('Mining failed:', err)
      toast.error(`Mining failed: ${errorMessage(err)}`)
    },
  })
}

export type LabCreateTransactionVariables = {
  entityName: string
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
  knownRecipientOwner?: string | null
}

export function useLabCreateTransactionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'createLabEntityTransaction'] as const,
    mutationFn: async (variables: LabCreateTransactionVariables) => {
      return labOpCreateLabEntityTransaction({
        entityName: variables.entityName,
        fromAddress: variables.fromAddress,
        toAddress: variables.toAddress,
        amountSats: variables.amountSats,
        feeRateSatPerVb: variables.feeRateSatPerVb,
        knownRecipientOwner: variables.knownRecipientOwner,
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

export type LabCreateRandomTransactionsVariables = {
  count: number
  onProgress?: (createdCount: number, requestedCount: number) => void
}

export function useLabCreateRandomTransactionsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'createRandomLabEntityTransactions'] as const,
    mutationFn: async (variables: LabCreateRandomTransactionsVariables) => {
      return labOpCreateRandomLabEntityTransactions(variables.count, {
        onProgress: variables.onProgress,
      })
    },
    onSuccess: (result, variables) => {
      setLabChainStateCache(queryClient, result.state)
      if (result.createdCount === variables.count) {
        toast.success(`Created ${result.createdCount} random transaction(s)`)
        return
      }
      toast.success(
        `Created ${result.createdCount} of ${variables.count} random transaction(s)`,
      )
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Random transactions failed')
    },
    onSettled: (_data, error) => {
      if (error != null) {
        void queryClient.invalidateQueries({ queryKey: labChainStateQueryKey })
      }
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
