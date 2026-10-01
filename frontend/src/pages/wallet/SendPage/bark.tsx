import { useCallback, useMemo } from 'react'
import { useBarkSendMutation } from '@/hooks/useBarkSendMutation'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import {
  canBuildBarkSend,
  isBarkSendMode,
  isSendRecipientFormatValidWithBark,
} from '@/lib/bark/send-flow-validation'
import { useFeatureStore } from '@/stores/featureStore'
import type { NetworkMode } from '@/stores/walletStore'

/** The form checks the last shown balance. The worker applies the real fee quote at submit. */
const BARK_SEND_FORM_FEE_SATS = 0

export function useSendFlowBark({
  networkMode,
  normalizedRecipient,
  amountSats,
  lightningAvailable,
  recipientFormatValidWithoutBark,
}: {
  networkMode: NetworkMode
  normalizedRecipient: string
  amountSats: number
  lightningAvailable: boolean
  recipientFormatValidWithoutBark: boolean
}) {
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const barkAvailable = isBarkEnabled && networkMode === 'signet'
  const barkSendMode = useMemo(
    () => isBarkSendMode(barkAvailable, normalizedRecipient, lightningAvailable),
    [barkAvailable, normalizedRecipient, lightningAvailable],
  )
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const barkSendMutation = useBarkSendMutation()
  const barkSpendableSats = barkAvailable ? syncSnapshot.spendableSats : null

  const recipientFormatValid = useMemo(
    () =>
      isSendRecipientFormatValidWithBark({
        recipientFormatValidWithoutBark,
        barkAvailable,
        normalizedRecipient,
      }),
    [recipientFormatValidWithoutBark, barkAvailable, normalizedRecipient],
  )

  const canBuildBark = canBuildBarkSend({
    isBarkSendMode: barkSendMode,
    normalizedRecipient,
    amountSats,
    barkSpendableSats,
    barkFeeSats: BARK_SEND_FORM_FEE_SATS,
  })

  const submitBarkPayment = useCallback(async () => {
    if (barkSendMutation.isPending) return
    await barkSendMutation.mutateAsync({
      address: normalizedRecipient,
      amountSats,
    })
  }, [barkSendMutation, normalizedRecipient, amountSats])

  return {
    barkAvailable,
    isBarkSendMode: barkSendMode,
    recipientFormatValid,
    canBuildBark,
    submitBarkPayment,
    barkSpendableSats,
    barkBalanceLoading:
      barkAvailable && syncSnapshot.syncPhase === 'syncing' && barkSpendableSats == null,
    barkSendMutation,
  }
}
