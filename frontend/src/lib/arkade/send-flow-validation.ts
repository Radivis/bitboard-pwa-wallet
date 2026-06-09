import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import { isValidArkadeAddress } from '@/lib/arkade/arkade-address'
import type { NetworkMode } from '@/stores/walletStore'
import {
  isLightningSendMode,
  isSendRecipientFormatValid as isOnChainOrLightningRecipientFormatValid,
} from '@/lib/lightning/send-flow-validation'

export function isArkadeSendMode(
  arkadeAvailable: boolean,
  normalizedRecipient: string,
  lightningAvailable: boolean,
): boolean {
  if (!arkadeAvailable) return false
  if (isLightningSendMode(lightningAvailable, normalizedRecipient)) return false
  return isValidArkadeAddress(normalizedRecipient)
}

export type IsSendRecipientFormatValidWithArkadeInput = {
  normalizedRecipient: string
  networkMode: NetworkMode
  lightningAvailable: boolean
  arkadeAvailable: boolean
}

export function isSendRecipientFormatValidWithArkade({
  normalizedRecipient,
  networkMode,
  lightningAvailable,
  arkadeAvailable,
}: IsSendRecipientFormatValidWithArkadeInput): boolean {
  return (
    isOnChainOrLightningRecipientFormatValid({
      normalizedRecipient,
      networkMode,
      lightningAvailable,
    }) ||
    (arkadeAvailable && isValidArkadeAddress(normalizedRecipient))
  )
}

export type CanBuildArkadeSendInput = {
  isArkadeSendMode: boolean
  normalizedRecipient: string
  amountSats: number
  recipientFormatValid: boolean
  arkadeConfirmedBalanceSats: number | undefined
  arkadeBalanceQuerySuccess: boolean
  networkMode: NetworkMode
}

export function canBuildArkadeSend({
  isArkadeSendMode: arkadeMode,
  normalizedRecipient,
  amountSats,
  recipientFormatValid,
  arkadeConfirmedBalanceSats,
  arkadeBalanceQuerySuccess,
  networkMode,
}: CanBuildArkadeSendInput): boolean {
  if (!arkadeMode) return false
  if (networkMode === 'lab') return false
  return (
    recipientFormatValid &&
    normalizedRecipient.length > 0 &&
    isValidArkadeAddress(normalizedRecipient) &&
    isValidSendAmountSats(amountSats) &&
    arkadeBalanceQuerySuccess &&
    arkadeConfirmedBalanceSats !== undefined &&
    amountSats <= arkadeConfirmedBalanceSats
  )
}
