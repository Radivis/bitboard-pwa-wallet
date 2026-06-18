import { bech32 } from '@scure/base'

const LNURL_BECH32_PATTERN = /^lnurl1[02-9ac-hj-np-z]+$/i

export function decodeLnurlBech32ToUrl(input: string): string {
  const trimmed = input.trim()
  if (!LNURL_BECH32_PATTERN.test(trimmed)) {
    throw new Error('Invalid LNURL bech32 string')
  }

  const { prefix, bytes } = bech32.decodeToBytes(trimmed)
  if (prefix.toLowerCase() !== 'lnurl') {
    throw new Error('Invalid LNURL bech32 string')
  }

  return new TextDecoder().decode(bytes)
}
