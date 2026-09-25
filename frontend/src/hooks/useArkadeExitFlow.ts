import {
  useArkadeBalanceQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'

export function useArkadeExitFlow() {
  const balanceQuery = useArkadeBalanceQuery()
  const unilateralExitInProgressSats = balanceQuery.data?.unilateralExitInProgressSats ?? 0
  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(unilateralExitInProgressSats > 0)
  const hasUnilateralExitInProgress =
    unilateralExitInProgressSats > 0 || (inProgressQuery.data?.length ?? 0) > 0

  return { hasUnilateralExitInProgress }
}
