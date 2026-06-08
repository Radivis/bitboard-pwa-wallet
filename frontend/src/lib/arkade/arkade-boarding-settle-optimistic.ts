import type { QueryClient } from '@tanstack/react-query'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  arkadeBalanceQueryKey,
  arkadeBoardingStatusQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import type { ArkadeBalanceInfo, ArkadeBoardingStatus } from '@/workers/arkade-api'

export type BoardingSettleOptimisticContext = {
  boardingStatusKey: ReturnType<typeof arkadeBoardingStatusQueryKey>
  balanceKey: ReturnType<typeof arkadeBalanceQueryKey>
  previousStatus: ArkadeBoardingStatus | undefined
  previousBalance: ArkadeBalanceInfo | undefined
  settledSats: number
}

export function zeroBoardingStatus(
  status: ArkadeBoardingStatus,
): ArkadeBoardingStatus {
  return {
    ...status,
    spendableSats: 0,
    pendingSats: 0,
    expiredSats: 0,
  }
}

/** Apply immediately when settle starts so UI does not wait for the operator RPC. */
export function applyOptimisticBoardingSettle(
  queryClient: QueryClient,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  settledSats: number,
): void {
  const boardingStatusKey = arkadeBoardingStatusQueryKey(walletId, networkMode, connectionId)
  const previousStatus = queryClient.getQueryData<ArkadeBoardingStatus>(boardingStatusKey)

  if (previousStatus != null) {
    queryClient.setQueryData<ArkadeBoardingStatus>(
      boardingStatusKey,
      zeroBoardingStatus(previousStatus),
    )
  }

  if (settledSats <= 0) {
    return
  }

  const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
  const previousBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
  if (previousBalance == null) {
    return
  }

  queryClient.setQueryData<ArkadeBalanceInfo>(balanceKey, {
    ...previousBalance,
    confirmedSats: previousBalance.confirmedSats + settledSats,
    totalSats: previousBalance.totalSats + settledSats,
    boardingSpendableSats: 0,
    boardingPendingSats: 0,
  })
}

export function revertOptimisticBoardingSettle(
  queryClient: QueryClient,
  context: BoardingSettleOptimisticContext,
): void {
  if (context.previousStatus != null) {
    queryClient.setQueryData(context.boardingStatusKey, context.previousStatus)
  }
  if (context.previousBalance != null) {
    queryClient.setQueryData(context.balanceKey, context.previousBalance)
  }
}

/**
 * Esplora can still list the boarding UTXO for several seconds after a successful settle.
 * Keep boarding at zero and avoid double-counting once offchain balance already reflects VTXOs.
 */
export function reconcileBalanceAfterBoardingSettle(
  fetched: ArkadeBalanceInfo,
  settledSats: number,
): ArkadeBalanceInfo {
  if (settledSats <= 0) {
    return fetched
  }

  const staleBoardingSpendable = fetched.boardingSpendableSats ?? 0
  if (staleBoardingSpendable === 0) {
    return fetched
  }

  const offchainAlreadyReflectsSettle =
    staleBoardingSpendable === settledSats &&
    fetched.confirmedSats >= settledSats

  return {
    ...fetched,
    confirmedSats: offchainAlreadyReflectsSettle
      ? fetched.confirmedSats
      : fetched.confirmedSats + settledSats,
    boardingSpendableSats: 0,
    boardingPendingSats: 0,
  }
}

export function beginOptimisticBoardingSettle(
  queryClient: QueryClient,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
): BoardingSettleOptimisticContext {
  const boardingStatusKey = arkadeBoardingStatusQueryKey(walletId, networkMode, connectionId)
  const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
  const previousStatus = queryClient.getQueryData<ArkadeBoardingStatus>(boardingStatusKey)
  const previousBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)
  const settledSats = previousStatus?.spendableSats ?? 0

  applyOptimisticBoardingSettle(queryClient, walletId, networkMode, connectionId, settledSats)

  return {
    boardingStatusKey,
    balanceKey,
    previousStatus,
    previousBalance,
    settledSats,
  }
}
