import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { LabOwner } from '@/lib/lab-owner'
import {
  labOpCreateLabEntity,
  labOpCreateLabEntityTransaction,
  labOpCreateRandomLabEntityTransactions,
  labOpDeleteLabEntity,
  labOpMineBlocks,
  labOpRenameLabEntity,
  labOpReset,
  labOpSetLabEntityDead,
  labOpSetBlockWeightLimit,
  labOpSetMinerSubsidySats,
} from '@/lib/lab-worker-operations'
import { setLabChainStateCache } from '@/hooks/useLabChainStateQuery'
import { labChainStateQueryKey } from '@/lib/lab-chain-query'
import { invalidateLabPaginatedQueries } from '@/lib/lab-paginated-queries'
import type { AddressType } from '@/lib/wallet-domain-types'
import { errorMessage } from '@/lib/utils'

export type LabMineBlocksVariables = {
  count: number
  effectiveTarget: string
  mineOptions:
    | { ownerWalletId: number }
    | { ownerLabEntityId: number }
    | { ownerName: string }
    | undefined
  labAddressType: AddressType
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
      void invalidateLabPaginatedQueries(queryClient)
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
  labEntityId: number
  fromAddress: string
  toAddress: string
  amountSats: number
  feeRateSatPerVb: number
  knownRecipientOwner?: LabOwner | null
  applyChangeFreeBump?: boolean
}

export function useLabCreateTransactionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['lab', 'createLabEntityTransaction'] as const,
    mutationFn: async (variables: LabCreateTransactionVariables) => {
      return labOpCreateLabEntityTransaction({
        labEntityId: variables.labEntityId,
        fromAddress: variables.fromAddress,
        toAddress: variables.toAddress,
        amountSats: variables.amountSats,
        feeRateSatPerVb: variables.feeRateSatPerVb,
        knownRecipientOwner: variables.knownRecipientOwner,
        applyChangeFreeBump: variables.applyChangeFreeBump,
      })
    },
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
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
      void invalidateLabPaginatedQueries(queryClient)
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

export function useLabCreateLabEntityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'createLabEntity'] as const,
    mutationFn: (options?: {
      ownerName?: string
      labAddressType?: AddressType
      labNetwork?: string
    }) => labOpCreateLabEntity(options),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Lab entity created')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    },
  })
}

export function useLabRenameLabEntityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'renameLabEntity'] as const,
    mutationFn: ({ labEntityId, newName }: { labEntityId: number; newName: string }) =>
      labOpRenameLabEntity(labEntityId, newName),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Entity renamed')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Rename failed')
    },
  })
}

export function useLabDeleteLabEntityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'deleteLabEntity'] as const,
    mutationFn: (labEntityId: number) => labOpDeleteLabEntity(labEntityId),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Entity deleted')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    },
  })
}

export type LabSetEntityDeadVariables = {
  labEntityId: number
  dead: boolean
  labEntityDisplayName: string
}

export function useLabSetEntityDeadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'setLabEntityDead'] as const,
    mutationFn: ({ labEntityId, dead }: LabSetEntityDeadVariables) =>
      labOpSetLabEntityDead(labEntityId, dead),
    onSuccess: (state, variables) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      const name = variables.labEntityDisplayName
      if (variables.dead) {
        toast.success(`${name} has died suddenly!`)
      } else {
        toast.success(`The rumors of ${name}'s demise have been greatly exaggerated!`)
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    },
  })
}

export function useLabSetBlockWeightLimitMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'setBlockWeightLimit'] as const,
    mutationFn: (blockWeightLimit: number) => labOpSetBlockWeightLimit(blockWeightLimit),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Block weight limit updated (applies to future blocks)')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    },
  })
}

export function useLabSetMinerSubsidySatsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['lab', 'setMinerSubsidySats'] as const,
    mutationFn: (minerSubsidySats: number) => labOpSetMinerSubsidySats(minerSubsidySats),
    onSuccess: (state) => {
      setLabChainStateCache(queryClient, state)
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Miner subsidy updated (applies to future blocks)')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Update failed')
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
      void invalidateLabPaginatedQueries(queryClient)
      toast.success('Lab reset')
    },
    onError: (err) => {
      toast.error(errorMessage(err) || 'Reset failed')
    },
  })
}
