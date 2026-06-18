import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import {
  MAX_BOLT11_PAYMENT_REQUEST_LENGTH,
  MAX_LNURL_BECH32_LENGTH,
} from '@/lib/lightning/lightning-input-limits'
import {
  bolt11NetworkModeFromPrefix,
  isLightningAddress,
  isLnurlPayDestination,
  isValidBolt11Invoice,
  isValidLightningDestination,
  tryDecodeBolt11Invoice,
  type DecodedBolt11Invoice,
} from '@/lib/lightning/lightning-utils'
import { isValidAddress, MAX_SATS_MSAT_AMOUNT_NUMBER } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'

export function isLightningSendMode(
  lightningAvailable: boolean,
  normalizedRecipient: string,
): boolean {
  return lightningAvailable && isValidLightningDestination(normalizedRecipient)
}

export function getDecodedBolt11ForSend(
  normalizedRecipient: string,
): DecodedBolt11Invoice | null {
  if (!isValidBolt11Invoice(normalizedRecipient)) return null
  return tryDecodeBolt11Invoice(normalizedRecipient)
}

export function isBolt11NetworkMismatch(
  normalizedRecipient: string,
  networkMode: NetworkMode,
): boolean {
  if (!isValidBolt11Invoice(normalizedRecipient)) return false
  const invoiceNetwork = bolt11NetworkModeFromPrefix(normalizedRecipient)
  if (invoiceNetwork == null) return false
  return invoiceNetwork !== networkMode
}

export type NeedsUserLightningAmountInput = {
  isLightningSendMode: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
}

export function needsUserLightningAmount({
  isLightningSendMode,
  normalizedRecipient,
  decodedBolt11,
}: NeedsUserLightningAmountInput): boolean {
  if (!isLightningSendMode) return false
  if (isLightningAddress(normalizedRecipient)) return true
  if (isLnurlPayDestination(normalizedRecipient)) return true
  if (!isValidBolt11Invoice(normalizedRecipient)) return false
  return decodedBolt11 == null || decodedBolt11.satoshi === 0
}

export type ResolveLightningPayAmountSatsInput = {
  isLightningSendMode: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
  amountSats: number
}

export function resolveLightningPayAmountSats({
  isLightningSendMode,
  normalizedRecipient,
  decodedBolt11,
  amountSats,
}: ResolveLightningPayAmountSatsInput): number {
  if (!isLightningSendMode) return 0
  if (isValidBolt11Invoice(normalizedRecipient)) {
    if (decodedBolt11 != null && decodedBolt11.satoshi > 0) {
      return decodedBolt11.satoshi
    }
    return amountSats
  }
  return amountSats
}

export function isBolt11DecodeOk(
  normalizedRecipient: string,
  decodedBolt11: DecodedBolt11Invoice | null,
): boolean {
  if (!isValidBolt11Invoice(normalizedRecipient)) return true
  return decodedBolt11 != null
}

export type IsSendRecipientFormatValidInput = {
  normalizedRecipient: string
  networkMode: NetworkMode
  lightningAvailable: boolean
}

export function isSendRecipientFormatValid({
  normalizedRecipient,
  networkMode,
  lightningAvailable,
}: IsSendRecipientFormatValidInput): boolean {
  return (
    normalizedRecipient.length > 0 &&
    (isValidAddress(normalizedRecipient, networkMode) ||
      (lightningAvailable &&
        isValidLightningDestination(normalizedRecipient)))
  )
}

export function isLightningPayloadLengthOk(normalizedRecipient: string): boolean {
  if (isLnurlPayDestination(normalizedRecipient)) {
    return normalizedRecipient.length <= MAX_LNURL_BECH32_LENGTH
  }
  return normalizedRecipient.length <= MAX_BOLT11_PAYMENT_REQUEST_LENGTH
}

export function isLightningPayloadLengthOkForSend(
  isLightningSendMode: boolean,
  normalizedRecipient: string,
): boolean {
  return (
    !isLightningSendMode || isLightningPayloadLengthOk(normalizedRecipient)
  )
}

export function isLightningAmountInputOk(
  needsUserLightningAmount: boolean,
  amountSats: number,
): boolean {
  return !needsUserLightningAmount || isValidSendAmountSats(amountSats)
}

export type IsLightningBalanceOkInput = {
  hasLightningWalletSelected: boolean
  selectedLnBalanceQuerySuccess: boolean
  selectedLnBalanceSats: number | undefined
  lightningPayAmountSats: number
}

export function isLightningBalanceOk({
  hasLightningWalletSelected,
  selectedLnBalanceQuerySuccess,
  selectedLnBalanceSats,
  lightningPayAmountSats,
}: IsLightningBalanceOkInput): boolean {
  return (
    hasLightningWalletSelected &&
    selectedLnBalanceQuerySuccess &&
    selectedLnBalanceSats !== undefined &&
    lightningPayAmountSats <= selectedLnBalanceSats
  )
}

export type IsLightningAmountlessBolt11PayMsatsExactOkInput = {
  needsUserLightningAmount: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
  amountSats: number
}

export function isLightningAmountlessBolt11PayMsatsExactOk({
  needsUserLightningAmount,
  normalizedRecipient,
  decodedBolt11,
  amountSats,
}: IsLightningAmountlessBolt11PayMsatsExactOkInput): boolean {
  if (!needsUserLightningAmount) return true
  if (!isValidBolt11Invoice(normalizedRecipient)) return true
  if (decodedBolt11 == null || decodedBolt11.satoshi !== 0) {
    return true
  }
  return (
    Number.isInteger(amountSats) && amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
  )
}

export type CanBuildLightningSendInput = {
  normalizedRecipient: string
  amountSats: number
  recipientFormatValid: boolean
  isLightningSendMode: boolean
  matchingLightningConnectionsCount: number
  hasLightningWalletSelected: boolean
  bolt11NetworkMismatch: boolean
  bolt11DecodeOk: boolean
  needsUserLightningAmount: boolean
  lightningPayAmountSats: number
  selectedLnBalanceQuerySuccess: boolean
  selectedLnBalanceSats: number | undefined
  decodedBolt11: DecodedBolt11Invoice | null
}

export function canBuildLightningSend({
  normalizedRecipient,
  amountSats,
  recipientFormatValid,
  isLightningSendMode,
  matchingLightningConnectionsCount,
  hasLightningWalletSelected,
  bolt11NetworkMismatch,
  bolt11DecodeOk,
  needsUserLightningAmount,
  lightningPayAmountSats,
  selectedLnBalanceQuerySuccess,
  selectedLnBalanceSats,
  decodedBolt11,
}: CanBuildLightningSendInput): boolean {
  return (
    recipientFormatValid &&
    (!isLightningSendMode || matchingLightningConnectionsCount > 0) &&
    isLightningPayloadLengthOkForSend(
      isLightningSendMode,
      normalizedRecipient,
    ) &&
    hasLightningWalletSelected &&
    !bolt11NetworkMismatch &&
    bolt11DecodeOk &&
    isLightningAmountInputOk(needsUserLightningAmount, amountSats) &&
    lightningPayAmountSats >= 1 &&
    isLightningBalanceOk({
      hasLightningWalletSelected,
      selectedLnBalanceQuerySuccess,
      selectedLnBalanceSats,
      lightningPayAmountSats,
    }) &&
    isLightningAmountlessBolt11PayMsatsExactOk({
      needsUserLightningAmount,
      normalizedRecipient,
      decodedBolt11,
      amountSats,
    }) &&
    ((isLightningAddress(normalizedRecipient) ||
      isLnurlPayDestination(normalizedRecipient))
      ? isValidSendAmountSats(amountSats)
      : true)
  )
}
