import { useCallback, useMemo } from 'react'
import { useArkadeBalanceQuery, useArkadeSendMutation } from '@/hooks/useArkadeQueries'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  canBuildArkadeSend,
  isArkadeSendMode,
  isSendRecipientFormatValidWithArkade,
} from '@/lib/arkade/send-flow-validation'
import type { NetworkMode } from '@/stores/walletStore'

export function useSendFlowArkade({
  networkMode,
  normalizedRecipient,
  amountSats,
  lightningAvailable,
}: {
  networkMode: NetworkMode
  normalizedRecipient: string
  amountSats: number
  lightningAvailable: boolean
}) {
  const arkadeAvailable = isArkadeActiveForNetworkMode(networkMode)
  const arkadeSendMode = useMemo(
    () => isArkadeSendMode(arkadeAvailable, normalizedRecipient, lightningAvailable),
    [arkadeAvailable, normalizedRecipient, lightningAvailable],
  )

  const balanceQuery = useArkadeBalanceQuery()
  const arkadeSendMutation = useArkadeSendMutation()

  const recipientFormatValid = useMemo(
    () =>
      isSendRecipientFormatValidWithArkade({
        normalizedRecipient,
        networkMode,
        lightningAvailable,
        arkadeAvailable,
      }),
    [normalizedRecipient, networkMode, lightningAvailable, arkadeAvailable],
  )

  const arkadeConfirmedBalanceSats = balanceQuery.data?.confirmedSats

  const canBuildArkade = canBuildArkadeSend({
    isArkadeSendMode: arkadeSendMode,
    normalizedRecipient,
    amountSats,
    recipientFormatValid,
    arkadeConfirmedBalanceSats,
    arkadeBalanceQuerySuccess: balanceQuery.isSuccess,
    networkMode,
  })

  const submitArkadePayment = useCallback(async () => {
    if (arkadeSendMutation.isPending) return
    await arkadeSendMutation.mutateAsync({
      address: normalizedRecipient,
      amountSats,
    })
  }, [arkadeSendMutation, normalizedRecipient, amountSats])

  return {
    arkadeAvailable,
    isArkadeSendMode: arkadeSendMode,
    recipientFormatValid,
    canBuildArkade,
    submitArkadePayment,
    arkadeBalanceSats: arkadeConfirmedBalanceSats,
    arkadeBalanceLoading: balanceQuery.isLoading || balanceQuery.isFetching,
    arkadeSendMutation,
  }
}
