import type { RefObject } from 'react'
import { amountSatsFromForm } from '@/components/wallet/send/amount-sats-from-form'
import { useSendStore } from '@/stores/sendStore'

export type LabSendMutationParams = {
  normalizedRecipient: string
  amountSats: number
  effectiveFeeRate: number
  applyChangeFreeBump: boolean
}

export function resolveLabSendAmountSats(
  labApplyChangeFreeBump: boolean,
  labChangeFreeBumpBaseAmountSatsRef: RefObject<number | null>,
): number {
  const { amount, amountUnit } = useSendStore.getState()
  const parsedFromStore = amountSatsFromForm(amount, amountUnit)
  if (
    labApplyChangeFreeBump &&
    labChangeFreeBumpBaseAmountSatsRef.current != null
  ) {
    return labChangeFreeBumpBaseAmountSatsRef.current
  }
  return parsedFromStore
}

export function buildLabSendMutationParams(
  normalizedRecipient: string,
  effectiveFeeRate: number,
  labApplyChangeFreeBump: boolean,
  labChangeFreeBumpBaseAmountSatsRef: RefObject<number | null>,
): LabSendMutationParams {
  return {
    normalizedRecipient,
    amountSats: resolveLabSendAmountSats(
      labApplyChangeFreeBump,
      labChangeFreeBumpBaseAmountSatsRef,
    ),
    effectiveFeeRate,
    applyChangeFreeBump: labApplyChangeFreeBump,
  }
}
