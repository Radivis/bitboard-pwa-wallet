import {
  preferredRecipientFromBitcoinUri,
  tryParseBitcoinUri,
} from '@/lib/wallet/bip21'
import { normalizeLightningDestination } from '@/lib/lightning/lightning-utils'
import { stripPastedInvisibleCharacters } from '@/lib/wallet/strip-pasted-invisible-characters'

/** Trim, strip paste junk, parse BIP21 when present, and normalize for send. */
export function normalizeSendRecipient(recipient: string): string {
  const trimmed = stripPastedInvisibleCharacters(recipient).trim()
  const bip21 = tryParseBitcoinUri(trimmed)
  if (bip21 != null) {
    return normalizeLightningDestination(preferredRecipientFromBitcoinUri(bip21))
  }
  const core = trimmed.replace(/^bitcoin:/i, '')
  return normalizeLightningDestination(core)
}
