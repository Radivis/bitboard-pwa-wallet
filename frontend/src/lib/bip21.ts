import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { SATS_PER_BTC } from '@/lib/bitcoin-dust'
import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'

const BITCOIN_SCHEME = 'bitcoin:'

export type ParsedBitcoinUri = {
  address: string
  /** Amount in BTC from the `amount` query param, if valid and positive. */
  amountBtc: number | null
}

/**
 * Parses a [BIP21](https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki) payment URI.
 * Returns `null` if the string is not a `bitcoin:` URI or the address part is empty.
 */
export function tryParseBitcoinUri(raw: string): ParsedBitcoinUri | null {
  const trimmed = raw.trim()
  if (!trimmed.toLowerCase().startsWith(BITCOIN_SCHEME)) {
    return null
  }

  const rest = trimmed.slice(BITCOIN_SCHEME.length)
  const queryIndex = rest.indexOf('?')
  const addressEncoded =
    queryIndex === -1 ? rest.trim() : rest.slice(0, queryIndex).trim()
  if (!addressEncoded) {
    return null
  }

  let address: string
  try {
    address = decodeURIComponent(addressEncoded)
  } catch {
    address = addressEncoded
  }

  let amountBtc: number | null = null
  if (queryIndex !== -1) {
    const query = rest.slice(queryIndex + 1)
    const params = new URLSearchParams(query)
    const amountStr = params.get('amount')
    if (amountStr != null && amountStr !== '') {
      const n = parseFloat(amountStr)
      if (Number.isFinite(n) && n > 0) {
        amountBtc = n
      }
    }
  }

  return { address, amountBtc }
}

export type RecipientAndAmountFromScanned = {
  /** Value for the recipient field (bare address for BIP21; otherwise trimmed scan payload). */
  recipient: string
  /** Formatted amount string when BIP21 included a valid `amount`; omit to leave amount unchanged. */
  amountStr?: string
}

/**
 * Maps a decoded QR (or pasted) payload to send form fields: BIP21 URIs become a bare address
 * and optional amount; anything else is passed through as the recipient string.
 */
export function recipientAndAmountFromScannedPayload(
  raw: string,
  amountUnit: BitcoinDisplayUnit,
): RecipientAndAmountFromScanned {
  const t = raw.trim()
  const bip21 = tryParseBitcoinUri(t)
  if (bip21) {
    const out: RecipientAndAmountFromScanned = {
      recipient: bip21.address,
    }
    if (bip21.amountBtc != null) {
      const sats = Math.min(
        MAX_SAFE_SATS,
        Math.round(bip21.amountBtc * SATS_PER_BTC),
      )
      out.amountStr = formatAmountInBitcoinDisplayUnit(sats, amountUnit)
    }
    return out
  }
  return { recipient: t }
}
