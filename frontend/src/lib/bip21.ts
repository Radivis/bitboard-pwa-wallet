import type { BitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { formatAmountInBitcoinDisplayUnit } from '@/lib/bitcoin-display-unit'
import { SATS_PER_BTC } from '@/lib/bitcoin-utils'
import { MAX_SAFE_SATS } from '@/lib/bitcoin-utils'
import {
  isValidLightningDestination,
  normalizeLightningDestination,
} from '@/lib/lightning-utils'

const BITCOIN_SCHEME = 'bitcoin:'

export type ParsedBitcoinUri = {
  address: string
  /** Amount in BTC from the `amount` query param, if valid and positive. */
  amountBtc: number | null
  /**
   * Value of BIP21 `lightning=` (percent-decoded), if present.
   * May be prefixed with `lightning:` — callers use `preferredRecipientFromBitcoinUri` to pick LN vs address.
   */
  lightningParam: string | null
}

function getBitcoinUriQueryParam(
  params: URLSearchParams,
  nameLower: string,
): string | null {
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() === nameLower) {
      return value
    }
  }
  return null
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
  let lightningParam: string | null = null
  if (queryIndex !== -1) {
    const query = rest.slice(queryIndex + 1)
    const params = new URLSearchParams(query)
    const amountStr = getBitcoinUriQueryParam(params, 'amount')
    if (amountStr != null && amountStr !== '') {
      const n = parseFloat(amountStr)
      if (Number.isFinite(n) && n > 0) {
        amountBtc = n
      }
    }
    const lnEncoded = getBitcoinUriQueryParam(params, 'lightning')
    if (lnEncoded != null && lnEncoded.trim() !== '') {
      lightningParam = lnEncoded.trim()
    }
  }

  return { address, amountBtc, lightningParam }
}

/**
 * BIP21 often carries both an on-chain fallback address and `lightning=…` with a Bolt11 /
 * Lightning address. Prefer Lightning when `lightning` decodes as a usable destination so
 * send uses NWC + LN balance checks instead of an on-chain build.
 */
export function preferredRecipientFromBitcoinUri(parsed: ParsedBitcoinUri): string {
  if (parsed.lightningParam != null && parsed.lightningParam.trim() !== '') {
    const normalized = normalizeLightningDestination(parsed.lightningParam.trim())
    if (isValidLightningDestination(normalized)) {
      return normalized
    }
  }
  return parsed.address
}

export type RecipientAndAmountFromScanned = {
  /** Value for the recipient field (bare address for BIP21; otherwise trimmed scan payload). */
  recipient: string
  /** Formatted amount string when BIP21 included a valid `amount`; omit to leave amount unchanged. */
  amountStr?: string
}

/**
 * Maps a decoded QR (or pasted) payload to send form fields: BIP21 URIs become a Lightning
 * invoice/pay string when `lightning=` is present and valid (otherwise on-chain address) plus
 * optional amount; anything else passes through unchanged.
 */
export function recipientAndAmountFromScannedPayload(
  raw: string,
  amountUnit: BitcoinDisplayUnit,
): RecipientAndAmountFromScanned {
  const t = raw.trim()
  const bip21 = tryParseBitcoinUri(t)
  if (bip21) {
    const out: RecipientAndAmountFromScanned = {
      recipient: preferredRecipientFromBitcoinUri(bip21),
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
