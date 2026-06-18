/**
 * Same-origin LNURL fetch proxy (HTTPS upstream URLs only, SSRF guards).
 *
 * **Keep in sync with `frontend/src/lib/lightning/lnurl-proxy-upstream-url.ts`.**
 * This handler intentionally has zero imports outside this file because Vercel's
 * bundler cannot resolve imports from `src/`. See `docs/vercel-api-functions.md`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 10,
}

const MAX_LNURL_PROXY_URL_LENGTH = 2048
const UPSTREAM_TIMEOUT_MS = 8_000

// Inlined from src/lib/lightning/lnurl-proxy-upstream-url.ts
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

function isLnurlProxyUpstreamUrlAllowed(url: string): boolean {
  if (url.length > MAX_LNURL_PROXY_URL_LENGTH) {
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

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  res.setHeader('Access-Control-Max-Age', '86400')
}

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
])

const DROP_FOR_SAME_ORIGIN_CLIENT = new Set(['set-cookie', 'set-cookie2'])

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const url = new URL(req.url!, `https://${req.headers.host}`)
  const prefix = '/api/lnurl/'
  if (!url.pathname.startsWith(prefix)) {
    res.status(404).send('Not found')
    return
  }

  const rest = url.pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length !== 1 || segments[0] !== 'fetch') {
    res.status(404).send('Not found')
    return
  }

  const upstreamUrl = url.searchParams.get('url')
  if (upstreamUrl == null || upstreamUrl === '') {
    res.status(400).send('Missing url')
    return
  }

  if (!isLnurlProxyUpstreamUrlAllowed(upstreamUrl)) {
    res.status(400).send('Bad URL')
    return
  }

  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    res.status(405).send('Method not allowed')
    return
  }

  const forwardHeaders: Record<string, string> = {}
  const accept = req.headers['accept']
  if (accept && typeof accept === 'string') forwardHeaders['accept'] = accept

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    res.status(502).send('Upstream unreachable')
    return
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    res.status(502).send('Upstream redirect not allowed')
    return
  }

  const outHeaders: Record<string, string> = {}
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower)) return
    if (DROP_FOR_SAME_ORIGIN_CLIENT.has(lower)) return
    outHeaders[key] = value
  })

  Object.entries(outHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (method === 'HEAD') {
    res.status(upstream.status).end()
    return
  }

  const body = await upstream.arrayBuffer()
  res.status(upstream.status).send(Buffer.from(body))
}
