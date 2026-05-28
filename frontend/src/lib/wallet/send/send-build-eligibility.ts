import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import { isValidAddress } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'

export type IsLabWithNoBalanceInput = {
  networkMode: NetworkMode
  labBalanceSats: number | null
}

export function isLabWithNoBalance({
  networkMode,
  labBalanceSats,
}: IsLabWithNoBalanceInput): boolean {
  return (
    networkMode === 'lab' &&
    (labBalanceSats === 0 || labBalanceSats === null)
  )
}

export type CanBuildOnChainSendInput = {
  isLightningSendMode: boolean
  normalizedRecipient: string
  networkMode: NetworkMode
  amountSats: number
  confirmedBalance: number
  isLabWithNoBalance: boolean
  useCustomFee: boolean
  customFeeParsed: number | null
}

export function canBuildOnChainSend({
  isLightningSendMode,
  normalizedRecipient,
  networkMode,
  amountSats,
  confirmedBalance,
  isLabWithNoBalance,
  useCustomFee,
  customFeeParsed,
}: CanBuildOnChainSendInput): boolean {
  return (
    !isLightningSendMode &&
    normalizedRecipient.length > 0 &&
    isValidAddress(normalizedRecipient, networkMode) &&
    isValidSendAmountSats(amountSats) &&
    amountSats <= confirmedBalance &&
    !isLabWithNoBalance &&
    (!useCustomFee || customFeeParsed !== null)
  )
}

export type IsSendFiatRateOkInput = {
  mainnetFiatMode: boolean
  isLightningSendMode: boolean
  needsUserLightningAmount: boolean
  btcPriceInFiat: number | null | undefined
  fiatRatesQueryIsError: boolean
}

export function isSendFiatRateOk({
  mainnetFiatMode,
  isLightningSendMode,
  needsUserLightningAmount,
  btcPriceInFiat,
  fiatRatesQueryIsError,
}: IsSendFiatRateOkInput): boolean {
  return (
    !mainnetFiatMode ||
    (isLightningSendMode && !needsUserLightningAmount) ||
    (isUsableBtcSpotPriceInFiat(btcPriceInFiat) && !fiatRatesQueryIsError)
  )
}

export type CanProceedToSendReviewInput = {
  isLightningSendMode: boolean
  canBuildLightning: boolean
  canBuildOnChain: boolean
  fiatRateOk: boolean
}

export function canProceedToSendReview({
  isLightningSendMode,
  canBuildLightning,
  canBuildOnChain,
  fiatRateOk,
}: CanProceedToSendReviewInput): boolean {
  return (
    (isLightningSendMode ? canBuildLightning : canBuildOnChain) && fiatRateOk
  )
}
