import { isLightningSendMode } from '@/lib/lightning/send-flow-validation'
import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'
import type { NetworkMode } from '@/stores/walletStore'

/** Signet Bark policy addresses use HRP `tark` and version `p`. */
const BARK_SIGNET_POLICY_ADDRESS = /^tark1p[a-z0-9]+$/i

/** Mainnet Bark policy addresses use HRP `ark` and version `p`. */
const BARK_MAINNET_POLICY_ADDRESS = /^ark1p[a-z0-9]+$/i

export function isBarkSignetPolicyAddress(address: string): boolean {
  return BARK_SIGNET_POLICY_ADDRESS.test(address.trim())
}

export function isBarkMainnetPolicyAddress(address: string): boolean {
  return BARK_MAINNET_POLICY_ADDRESS.test(address.trim())
}

export function isBarkPolicyAddressForNetwork(
  address: string,
  networkMode: NetworkMode,
): boolean {
  if (networkMode === 'mainnet') return isBarkMainnetPolicyAddress(address)
  if (networkMode === 'signet') return isBarkSignetPolicyAddress(address)
  return false
}

export function isBarkSendMode(
  barkAvailable: boolean,
  normalizedRecipient: string,
  lightningAvailable: boolean,
  networkMode: NetworkMode,
): boolean {
  if (!barkAvailable) return false
  if (isLightningSendMode(lightningAvailable, normalizedRecipient)) return false
  return isBarkPolicyAddressForNetwork(normalizedRecipient, networkMode)
}

export function isSendRecipientFormatValidWithBark({
  recipientFormatValidWithoutBark,
  barkAvailable,
  normalizedRecipient,
  networkMode,
}: {
  recipientFormatValidWithoutBark: boolean
  barkAvailable: boolean
  normalizedRecipient: string
  networkMode: NetworkMode
}): boolean {
  return (
    recipientFormatValidWithoutBark ||
    (barkAvailable && isBarkPolicyAddressForNetwork(normalizedRecipient, networkMode))
  )
}

export function canBuildBarkSend({
  isBarkSendMode: barkMode,
  normalizedRecipient,
  amountSats,
  barkSpendableSats,
  barkFeeSats,
  networkMode,
}: {
  isBarkSendMode: boolean
  normalizedRecipient: string
  amountSats: number
  barkSpendableSats: number | null
  barkFeeSats: number
  networkMode: NetworkMode
}): boolean {
  if (!barkMode) return false
  if (barkSpendableSats == null) return false
  if (!isBarkPolicyAddressForNetwork(normalizedRecipient, networkMode)) return false
  if (!isValidSendAmountSats(amountSats)) return false
  if (!Number.isSafeInteger(barkFeeSats) || barkFeeSats < 0) return false
  return amountSats + barkFeeSats <= barkSpendableSats
}

export function sendRecipientFieldLabel({
  isLightningSendMode: lightningMode,
  isBarkSendMode: barkMode,
  isArkadeSendMode: arkadeMode,
}: {
  isLightningSendMode: boolean
  isBarkSendMode: boolean
  isArkadeSendMode: boolean
}): string {
  if (lightningMode) return 'Invoice, Lightning address, or LNURL'
  if (barkMode) return 'Bark address'
  if (arkadeMode) return 'Arkade address'
  return 'Recipient Address'
}

export function sendRecipientPlaceholder({
  isBarkSendMode: barkMode,
  isArkadeSendMode: arkadeMode,
  lightningAvailable,
  arkadeAvailable,
  barkAvailable,
  networkMode,
}: {
  isBarkSendMode: boolean
  isArkadeSendMode: boolean
  lightningAvailable: boolean
  arkadeAvailable: boolean
  barkAvailable: boolean
  networkMode: NetworkMode
}): string {
  const barkHint = networkMode === 'mainnet' ? 'ark1p…' : 'tark1p…'
  if (barkMode) return barkHint
  if (arkadeMode) return 'ark1… or tark1…'
  if (lightningAvailable && arkadeAvailable && barkAvailable) {
    return `bc1q…, ${barkHint}, ark1…, BOLT11, Lightning address, or LNURL`
  }
  if (lightningAvailable && arkadeAvailable) {
    return 'bc1q…, ark1…, BOLT11, Lightning address, or LNURL'
  }
  if (lightningAvailable && barkAvailable) {
    return `bc1q…, ${barkHint}, BOLT11, Lightning address, or LNURL`
  }
  if (lightningAvailable) {
    return 'bc1q…, BOLT11, Lightning address, or LNURL'
  }
  if (arkadeAvailable && barkAvailable) {
    return `bc1q…, ${barkHint}, or ark1… / tark1…`
  }
  if (arkadeAvailable) return 'bc1q… or ark1… / tark1…'
  if (barkAvailable) return `bc1q… or ${barkHint}`
  return 'bc1q…'
}

export function sendRecipientFormatErrorMessage({
  isLightningSendMode: lightningMode,
  isArkadeSendMode: arkadeMode,
  barkAvailable,
  arkadeAvailable,
  lightningAvailable,
  networkMode,
}: {
  isLightningSendMode: boolean
  isArkadeSendMode: boolean
  barkAvailable: boolean
  arkadeAvailable: boolean
  lightningAvailable: boolean
  networkMode: string
}): string {
  if (lightningMode) {
    return 'Invalid Lightning invoice, Lightning address, or LNURL.'
  }
  if (arkadeMode) {
    return 'Invalid Arkade address (ark1 or tark1).'
  }
  if (barkAvailable && arkadeAvailable && lightningAvailable) {
    return `Invalid address for ${networkMode}, Bark, Arkade, or Lightning.`
  }
  if (arkadeAvailable && lightningAvailable) {
    return `Invalid address for ${networkMode}, Arkade, or Lightning.`
  }
  if (barkAvailable && lightningAvailable) {
    return `Invalid address for ${networkMode}, Bark, or Lightning.`
  }
  if (barkAvailable && arkadeAvailable) {
    return `Invalid on-chain, Bark, or Arkade address for ${networkMode}.`
  }
  if (arkadeAvailable) {
    return `Invalid on-chain or Arkade address for ${networkMode}.`
  }
  if (barkAvailable) {
    return `Invalid on-chain or Bark address for ${networkMode}.`
  }
  return `Invalid address for ${networkMode}`
}
