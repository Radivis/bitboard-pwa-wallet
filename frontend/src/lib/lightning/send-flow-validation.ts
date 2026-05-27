import { isValidSendAmountSats } from '@/components/wallet/send/send-amount'
import { MAX_BOLT11_PAYMENT_REQUEST_LENGTH } from '@/lib/lightning/lightning-input-limits'
import {
  bolt11NetworkModeFromPrefix,
  isLightningAddress,
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

export function needsUserLightningAmount(params: {
  isLightningSendMode: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
}): boolean {
  if (!params.isLightningSendMode) return false
  if (isLightningAddress(params.normalizedRecipient)) return true
  if (!isValidBolt11Invoice(params.normalizedRecipient)) return false
  return params.decodedBolt11 == null || params.decodedBolt11.satoshi === 0
}

export function resolveLightningPayAmountSats(params: {
  isLightningSendMode: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
  amountSats: number
}): number {
  if (!params.isLightningSendMode) return 0
  if (isValidBolt11Invoice(params.normalizedRecipient)) {
    if (params.decodedBolt11 != null && params.decodedBolt11.satoshi > 0) {
      return params.decodedBolt11.satoshi
    }
    return params.amountSats
  }
  return params.amountSats
}

export function isBolt11DecodeOk(
  normalizedRecipient: string,
  decodedBolt11: DecodedBolt11Invoice | null,
): boolean {
  if (!isValidBolt11Invoice(normalizedRecipient)) return true
  return decodedBolt11 != null
}

export function isSendRecipientFormatValid(params: {
  normalizedRecipient: string
  networkMode: NetworkMode
  lightningAvailable: boolean
}): boolean {
  return (
    params.normalizedRecipient.length > 0 &&
    (isValidAddress(params.normalizedRecipient, params.networkMode) ||
      (params.lightningAvailable &&
        isValidLightningDestination(params.normalizedRecipient)))
  )
}

export function isLightningPayloadLengthOk(normalizedRecipient: string): boolean {
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

export function isLightningBalanceOk(params: {
  hasLightningWalletSelected: boolean
  selectedLnBalanceQuerySuccess: boolean
  selectedLnBalanceSats: number | undefined
  lightningPayAmountSats: number
}): boolean {
  return (
    params.hasLightningWalletSelected &&
    params.selectedLnBalanceQuerySuccess &&
    params.selectedLnBalanceSats !== undefined &&
    params.lightningPayAmountSats <= params.selectedLnBalanceSats
  )
}

export function isLightningAmountlessBolt11PayMsatsExactOk(params: {
  needsUserLightningAmount: boolean
  normalizedRecipient: string
  decodedBolt11: DecodedBolt11Invoice | null
  amountSats: number
}): boolean {
  if (!params.needsUserLightningAmount) return true
  if (!isValidBolt11Invoice(params.normalizedRecipient)) return true
  if (params.decodedBolt11 == null || params.decodedBolt11.satoshi !== 0) {
    return true
  }
  return (
    Number.isInteger(params.amountSats) &&
    params.amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
  )
}

export function canBuildLightningSend(params: {
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
}): boolean {
  return (
    params.recipientFormatValid &&
    (!params.isLightningSendMode || params.matchingLightningConnectionsCount > 0) &&
    isLightningPayloadLengthOkForSend(
      params.isLightningSendMode,
      params.normalizedRecipient,
    ) &&
    params.matchingLightningConnectionsCount > 0 &&
    params.hasLightningWalletSelected &&
    !params.bolt11NetworkMismatch &&
    params.bolt11DecodeOk &&
    isLightningAmountInputOk(params.needsUserLightningAmount, params.amountSats) &&
    params.lightningPayAmountSats >= 1 &&
    isLightningBalanceOk({
      hasLightningWalletSelected: params.hasLightningWalletSelected,
      selectedLnBalanceQuerySuccess: params.selectedLnBalanceQuerySuccess,
      selectedLnBalanceSats: params.selectedLnBalanceSats,
      lightningPayAmountSats: params.lightningPayAmountSats,
    }) &&
    isLightningAmountlessBolt11PayMsatsExactOk({
      needsUserLightningAmount: params.needsUserLightningAmount,
      normalizedRecipient: params.normalizedRecipient,
      decodedBolt11: params.decodedBolt11,
      amountSats: params.amountSats,
    }) &&
    (isLightningAddress(params.normalizedRecipient)
      ? isValidSendAmountSats(params.amountSats)
      : true)
  )
}
