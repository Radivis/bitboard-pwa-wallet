import { MAX_LNURL_BECH32_LENGTH } from './lightning-input-limits'

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (match == null) {
    return false
  }
  const octets = match.slice(1, 5).map((part) => Number(part))
  if (octets.some((octet) => octet > 255)) {
    return true
  }
  const [a, b] = octets
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  return false
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost') return true
  if (lower.endsWith('.localhost')) return true
  if (lower.endsWith('.local')) return true
  if (lower.endsWith('.internal')) return true
  if (isPrivateOrReservedIpv4(lower)) return true
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return isPrivateOrReservedIpv6(lower.slice(1, -1))
  }
  if (lower.includes(':')) {
    return isPrivateOrReservedIpv6(lower)
  }
  return false
}

/**
 * Whether an upstream HTTPS URL may be fetched by the LNURL same-origin proxy.
 * Keep in sync with inlined checks in `frontend/api/lnurl/[...path].ts`.
 */
export function isLnurlProxyUpstreamUrlAllowed(url: string): boolean {
  if (url.length > MAX_LNURL_BECH32_LENGTH) {
    return false
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') {
    return false
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return false
  }

  if (parsed.hostname === '') {
    return false
  }

  if (isBlockedHostname(parsed.hostname)) {
    return false
  }

  return true
}
