/**
 * Optimistic Arkade balance updates while exit RPCs run.
 *
 * Unilateral vs collaborative paths differ — see `docs/arkade-bitboard-wallet-model.md`
 * (Unilateral vs collaborative exit balance timing).
 *
 * - **Unilateral:** only bump `unilateralExitInProgressSats`. After unroll, WASM excludes the
 *   VTXO from gross spendable via the spent bucket; subtracting here would double-count.
 * - **Collaborative:** also reduce net spendable fields; snapshot still lists exiting VTXOs as
 *   spendable until operator sync.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { arkadeBalanceQueryKey } from '@/lib/arkade/arkade-query-keys'
import type { ArkadeBalanceInfo } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

export type ExitBalanceOptimisticContext = {
  balanceKey: ReturnType<typeof arkadeBalanceQueryKey>
  previousBalance: ArkadeBalanceInfo | undefined
  deductedSats: number
  exitField: 'unilateralExitInProgressSats' | 'collaborativeExitInProgressSats'
}

function applyExitDeductionToBalance(
  balance: ArkadeBalanceInfo,
  deductedSats: number,
  exitField: ExitBalanceOptimisticContext['exitField'],
): ArkadeBalanceInfo {
  const previousExitSats = balance[exitField] ?? 0
  const nextBalance: ArkadeBalanceInfo = {
    ...balance,
    [exitField]: previousExitSats + deductedSats,
  }

  if (exitField === 'collaborativeExitInProgressSats') {
    return {
      ...nextBalance,
      confirmedSats: Math.max(0, balance.confirmedSats - deductedSats),
      totalSats: Math.max(0, balance.totalSats - deductedSats),
      offchainSpendableSats:
        balance.offchainSpendableSats != null
          ? Math.max(0, balance.offchainSpendableSats - deductedSats)
          : undefined,
    }
  }

  // Unilateral: exit line only — spendable totals unchanged (matches post-unroll WASM).
  return nextBalance
}

export function applyOptimisticExitBalanceDeduction(
  queryClient: QueryClient,
  walletId: number,
  networkMode: ArkadeSupportedNetworkMode,
  connectionId: string,
  deductedSats: number,
  exitField: ExitBalanceOptimisticContext['exitField'],
): ExitBalanceOptimisticContext {
  const balanceKey = arkadeBalanceQueryKey(walletId, networkMode, connectionId)
  const previousBalance = queryClient.getQueryData<ArkadeBalanceInfo>(balanceKey)

  if (previousBalance != null && deductedSats > 0) {
    const optimisticBalance = applyExitDeductionToBalance(
      previousBalance,
      deductedSats,
      exitField,
    )
    queryClient.setQueryData(balanceKey, optimisticBalance)
    useWalletStore.getState().setArkadeDashboardState({
      balance: optimisticBalance,
      payments: useWalletStore.getState().arkadePayments,
      receiveAddress: useWalletStore.getState().arkadeReceiveAddress ?? '',
    })
  }

  return {
    balanceKey,
    previousBalance,
    deductedSats,
    exitField,
  }
}

export function revertOptimisticExitBalanceDeduction(
  queryClient: QueryClient,
  context: ExitBalanceOptimisticContext,
): void {
  if (context.previousBalance != null) {
    queryClient.setQueryData(context.balanceKey, context.previousBalance)
    useWalletStore.getState().setArkadeDashboardState({
      balance: context.previousBalance,
      payments: useWalletStore.getState().arkadePayments,
      receiveAddress: useWalletStore.getState().arkadeReceiveAddress ?? '',
    })
  }
}

/**
 * Prefer WASM balance after operator sync; patch only the exit-in-progress field if WASM lags.
 * For unilateral paths, never reduces spendable totals — see module doc above.
 */
export function reconcileBalanceAfterExitOperation(
  fetched: ArkadeBalanceInfo,
  context: ExitBalanceOptimisticContext,
): ArkadeBalanceInfo {
  if (context.deductedSats <= 0 || context.previousBalance == null) {
    return fetched
  }

  const fetchedExitSats = fetched[context.exitField] ?? 0
  const previousExitSats = context.previousBalance[context.exitField] ?? 0
  if (fetchedExitSats >= previousExitSats + context.deductedSats) {
    return fetched
  }

  const missingExitSats =
    previousExitSats + context.deductedSats - fetchedExitSats
  return applyExitDeductionToBalance(fetched, missingExitSats, context.exitField)
}
