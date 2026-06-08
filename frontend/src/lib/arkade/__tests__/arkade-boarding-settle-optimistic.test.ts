import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  applyOptimisticBoardingSettle,
  reconcileBalanceAfterBoardingSettle,
  revertOptimisticBoardingSettle,
} from '@/lib/arkade/arkade-boarding-settle-optimistic'
import {
  arkadeBalanceQueryKey,
  arkadeBoardingStatusQueryKey,
} from '@/lib/arkade/arkade-query-keys'

const walletId = 1
const networkMode = 'signet' as const

describe('arkade-boarding-settle-optimistic', () => {
  it('zeros boarding status and moves spendable sats into balance on mutate', () => {
    const queryClient = new QueryClient()
    const boardingStatusKey = arkadeBoardingStatusQueryKey(walletId, networkMode)
    const balanceKey = arkadeBalanceQueryKey(walletId, networkMode)

    queryClient.setQueryData(boardingStatusKey, {
      boardingAddress: 'tb1boarding',
      trackedAddresses: ['tb1boarding'],
      spendableSats: 200_000,
      pendingSats: 0,
      expiredSats: 0,
    })
    queryClient.setQueryData(balanceKey, {
      confirmedSats: 30_603,
      totalSats: 30_603,
      boardingSpendableSats: 200_000,
      boardingPendingSats: 0,
    })

    applyOptimisticBoardingSettle(queryClient, walletId, networkMode, 200_000)

    expect(queryClient.getQueryData(boardingStatusKey)).toMatchObject({
      spendableSats: 0,
      pendingSats: 0,
      expiredSats: 0,
    })
    expect(queryClient.getQueryData(balanceKey)).toMatchObject({
      confirmedSats: 230_603,
      boardingSpendableSats: 0,
      boardingPendingSats: 0,
    })
  })

  it('reverts optimistic cache updates when settle fails', () => {
    const queryClient = new QueryClient()
    const boardingStatusKey = arkadeBoardingStatusQueryKey(walletId, networkMode)
    const balanceKey = arkadeBalanceQueryKey(walletId, networkMode)
    const previousStatus = {
      boardingAddress: 'tb1boarding',
      trackedAddresses: ['tb1boarding'],
      spendableSats: 200_000,
      pendingSats: 0,
      expiredSats: 0,
    }
    const previousBalance = {
      confirmedSats: 30_603,
      totalSats: 30_603,
      boardingSpendableSats: 200_000,
      boardingPendingSats: 0,
    }

    queryClient.setQueryData(boardingStatusKey, previousStatus)
    queryClient.setQueryData(balanceKey, previousBalance)
    applyOptimisticBoardingSettle(queryClient, walletId, networkMode, 200_000)
    revertOptimisticBoardingSettle(queryClient, {
      boardingStatusKey,
      balanceKey,
      previousStatus,
      previousBalance,
      settledSats: 200_000,
    })

    expect(queryClient.getQueryData(boardingStatusKey)).toEqual(previousStatus)
    expect(queryClient.getQueryData(balanceKey)).toEqual(previousBalance)
  })

  it('clears stale boarding from a post-settle balance fetch without double-counting', () => {
    const reconciled = reconcileBalanceAfterBoardingSettle(
      {
        confirmedSats: 230_603,
        totalSats: 230_603,
        boardingSpendableSats: 200_000,
        boardingPendingSats: 0,
      },
      200_000,
    )

    expect(reconciled.confirmedSats).toBe(230_603)
    expect(reconciled.boardingSpendableSats).toBe(0)
  })

  it('raises confirmed balance when offchain fetch lags behind settle', () => {
    const reconciled = reconcileBalanceAfterBoardingSettle(
      {
        confirmedSats: 30_603,
        totalSats: 30_603,
        boardingSpendableSats: 200_000,
        boardingPendingSats: 0,
      },
      200_000,
    )

    expect(reconciled.confirmedSats).toBe(230_603)
    expect(reconciled.boardingSpendableSats).toBe(0)
  })
})
