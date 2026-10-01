import { isLightningSendMode } from '@/lib/lightning/send-flow-validation'
import { isValidSendAmountSats } from '@/lib/wallet/send/send-amount-validation'

/** Signet Bark policy addresses use HRP `tark` and version `p`. `ark1p` is mainnet. */
const BARK_SIGNET_POLICY_ADDRESS = /^tark1p[a-z0-9]+$/i

export function isBarkSignetPolicyAddress(address: string): boolean {
  return BARK_SIGNET_POLICY_ADDRESS.test(address.trim())
}

export function isBarkSendMode(
  barkAvailable: boolean,
  normalizedRecipient: string,
  lightningAvailable: boolean,
): boolean {
  if (!barkAvailable) return false
  if (isLightningSendMode(lightningAvailable, normalizedRecipient)) return false
  return isBarkSignetPolicyAddress(normalizedRecipient)
}

export function isSendRecipientFormatValidWithBark({
  recipientFormatValidWithoutBark,
  barkAvailable,
  normalizedRecipient,
}: {
  recipientFormatValidWithoutBark: boolean
  barkAvailable: boolean
  normalizedRecipient: string
}): boolean {
  return (
    recipientFormatValidWithoutBark ||
    (barkAvailable && isBarkSignetPolicyAddress(normalizedRecipient))
  )
}

export function canBuildBarkSend({
  isBarkSendMode: barkMode,
  normalizedRecipient,
  amountSats,
  barkSpendableSats,
  barkFeeSats,
}: {
  isBarkSendMode: boolean
  normalizedRecipient: string
  amountSats: number
  barkSpendableSats: number | null
  barkFeeSats: number
}): boolean {
  if (!barkMode) return false
  if (barkSpendableSats == null) return false
  if (!isBarkSignetPolicyAddress(normalizedRecipient)) return false
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
}: {
  isBarkSendMode: boolean
  isArkadeSendMode: boolean
  lightningAvailable: boolean
  arkadeAvailable: boolean
  barkAvailable: boolean
}): string {
  if (barkMode) return 'tark1p…'
  if (arkadeMode) return 'ark1… or tark1…'
  if (lightningAvailable && arkadeAvailable && barkAvailable) {
    return 'bc1q…, tark1p…, ark1…, BOLT11, Lightning address, or LNURL'
  }
  if (lightningAvailable && arkadeAvailable) {
    return 'bc1q…, ark1…, BOLT11, Lightning address, or LNURL'
  }
  if (lightningAvailable && barkAvailable) {
    return 'bc1q…, tark1p…, BOLT11, Lightning address, or LNURL'
  }
  if (lightningAvailable) {
    return 'bc1q…, BOLT11, Lightning address, or LNURL'
  }
  if (arkadeAvailable && barkAvailable) {
    return 'bc1q…, tark1p…, or ark1… / tark1…'
  }
  if (arkadeAvailable) return 'bc1q… or ark1… / tark1…'
  if (barkAvailable) return 'bc1q… or tark1p…'
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
