import { isValidSendAmountSats } from '@/components/wallet/send/send-amount'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import { isValidAddress } from '@/lib/wallet/bitcoin-utils'
import type { NetworkMode } from '@/stores/walletStore'

export function isLabWithNoBalance(params: {
  networkMode: NetworkMode
  labBalanceSats: number | null
}): boolean {
  return (
    params.networkMode === 'lab' &&
    (params.labBalanceSats === 0 || params.labBalanceSats === null)
  )
}

export function canBuildOnChainSend(params: {
  isLightningSendMode: boolean
  normalizedRecipient: string
  networkMode: NetworkMode
  amountSats: number
  confirmedBalance: number
  isLabWithNoBalance: boolean
  useCustomFee: boolean
  customFeeParsed: number | null
}): boolean {
  return (
    !params.isLightningSendMode &&
    params.normalizedRecipient.length > 0 &&
    isValidAddress(params.normalizedRecipient, params.networkMode) &&
    isValidSendAmountSats(params.amountSats) &&
    params.amountSats <= params.confirmedBalance &&
    !params.isLabWithNoBalance &&
    (!params.useCustomFee || params.customFeeParsed !== null)
  )
}

export function isSendFiatRateOk(params: {
  mainnetFiatMode: boolean
  isLightningSendMode: boolean
  needsUserLightningAmount: boolean
  btcPriceInFiat: number | null | undefined
  fiatRatesQueryIsError: boolean
}): boolean {
  return (
    !params.mainnetFiatMode ||
    (params.isLightningSendMode && !params.needsUserLightningAmount) ||
    (isUsableBtcSpotPriceInFiat(params.btcPriceInFiat) &&
      !params.fiatRatesQueryIsError)
  )
}

export function canProceedToSendReview(params: {
  isLightningSendMode: boolean
  canBuildLightning: boolean
  canBuildOnChain: boolean
  fiatRateOk: boolean
}): boolean {
  return (
    (params.isLightningSendMode
      ? params.canBuildLightning
      : params.canBuildOnChain) && params.fiatRateOk
  )
}
