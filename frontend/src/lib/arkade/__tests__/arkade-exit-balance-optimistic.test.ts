import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  applyOptimisticExitBalanceDeduction,
  reconcileBalanceAfterExitOperation,
  revertOptimisticExitBalanceDeduction,
} from '@/lib/arkade/arkade-exit-balance-optimistic'
import { arkadeBalanceQueryKey } from '@/lib/arkade/arkade-query-keys'

const walletId = 1
const networkMode = 'signet' as const
const connectionId = 'conn-1'

describe('arkade-exit-balance-optimistic', () => {
  it('deducts unilateral exit from cached balance on mutate', () => {
    const queryClient = new QueryClient()
    const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
    const previousBalance = {
      confirmedSats: 200_000,
      totalSats: 200_000,
      unilateralExitInProgressSats: 0,
      collaborativeExitInProgressSats: 0,
    }
    queryClient.setQueryData(balanceKey, previousBalance)

    const context = applyOptimisticExitBalanceDeduction(
      queryClient,
      walletId,
      networkMode,
      connectionId,
      180_603,
      'unilateralExitInProgressSats',
    )

    expect(queryClient.getQueryData(balanceKey)).toEqual({
      confirmedSats: 19_397,
      totalSats: 19_397,
      unilateralExitInProgressSats: 180_603,
      collaborativeExitInProgressSats: 0,
    })
    expect(context.previousBalance).toEqual(previousBalance)
  })

  it('reverts optimistic deduction on error', () => {
    const queryClient = new QueryClient()
    const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
    const previousBalance = {
      confirmedSats: 200_000,
      totalSats: 200_000,
    }
    queryClient.setQueryData(balanceKey, previousBalance)

    const context = applyOptimisticExitBalanceDeduction(
      queryClient,
      walletId,
      networkMode,
      connectionId,
      50_000,
      'collaborativeExitInProgressSats',
    )
    revertOptimisticExitBalanceDeduction(queryClient, context)

    expect(queryClient.getQueryData(balanceKey)).toEqual(previousBalance)
  })

  it('reconciles fetched balance when server exit bucket lags', () => {
    const context = {
      balanceKey: arkadeBalanceQueryKey(walletId, networkMode, connectionId),
      previousBalance: {
        confirmedSats: 200_000,
        totalSats: 200_000,
        unilateralExitInProgressSats: 0,
        collaborativeExitInProgressSats: 0,
      },
      deductedSats: 180_603,
      exitField: 'unilateralExitInProgressSats' as const,
    }

    const reconciled = reconcileBalanceAfterExitOperation(
      {
        confirmedSats: 200_000,
        totalSats: 200_000,
        unilateralExitInProgressSats: 0,
        collaborativeExitInProgressSats: 0,
      },
      context,
    )

    expect(reconciled.confirmedSats).toBe(19_397)
    expect(reconciled.unilateralExitInProgressSats).toBe(180_603)
  })
})
