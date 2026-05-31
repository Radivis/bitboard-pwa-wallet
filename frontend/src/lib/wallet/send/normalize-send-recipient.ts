import {
  preferredRecipientFromBitcoinUri,
  tryParseBitcoinUri,
} from '@/lib/wallet/bip21'
import { normalizeLightningDestination } from '@/lib/lightning/lightning-utils'

/** Trim, parse BIP21 when present, and normalize for on-chain or Lightning send. */
export function normalizeSendRecipient(recipient: string): string {
  const trimmed = recipient.trim()
  const bip21 = tryParseBitcoinUri(trimmed)
  if (bip21 != null) {
    return normalizeLightningDestination(preferredRecipientFromBitcoinUri(bip21))
  }
  const core = trimmed.replace(/^bitcoin:/i, '')
  return normalizeLightningDestination(core)
}
