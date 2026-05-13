/**
 * Same-origin proxy for public fiat-rate APIs (allowlisted providers + paths only).
 *
 * **Keep in sync with `frontend/src/lib/fiat-rate-service-whitelist.ts`** (provider IDs,
 * upstream bases, path prefixes) **and `frontend/src/lib/fiat-rates-proxy-cors.ts`** (CORS
 * allowlist). This handler intentionally has **zero imports outside this file** because Vercel's
 * `includeFiles` / cross-tree NFT tracing has proven unreliable for this project; any extra
 * import (including from `src/lib`, `api/_lib`, or a sibling `vercel-proxy-shared/` folder)
 * caused `FUNCTION_INVOCATION_FAILED` at runtime. See `api/esplora/[...path].ts` and
 * `api/faucet/[...path].ts` — they follow the same "fully self-contained" pattern.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 10,
}

type FiatRateProviderId = 'kraken' | 'coingecko' | 'blockchain'

// Inlined from src/lib/fiat-rates-proxy-cors.ts — see file-level comment above.
const FIAT_RATES_PROXY_CORS_ALLOWED_ORIGINS_EXACT: readonly string[] = [
  'https://bitboard-wallet.com',
  'https://app.bitboard-wallet.com',
  'https://bitboard-preview.vercel.app',
]

const FIAT_RATES_PROXY_CORS_PREVIEW_ORIGIN_RE =
  /^https:\/\/bitboard-pwa-wallet-[a-z0-9]+-radivis-projects\.vercel\.app$/i

function fiatRatesProxyCorsAllowedOrigin(
  originHeader: string | string[] | undefined,
): string | null {
  const raw =
    typeof originHeader === 'string'
      ? originHeader
      : Array.isArray(originHeader)
        ? originHeader[0]
        : undefined
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (FIAT_RATES_PROXY_CORS_ALLOWED_ORIGINS_EXACT.includes(raw)) return raw
  if (FIAT_RATES_PROXY_CORS_PREVIEW_ORIGIN_RE.test(raw)) return raw
  return null
}

const FIAT_RATE_PROVIDER_BASES: Record<FiatRateProviderId, string> = {
  kraken: 'https://api.kraken.com',
  coingecko: 'https://api.coingecko.com',
  blockchain: 'https://blockchain.info',
}

const FIAT_RATE_PROVIDER_PATH_PREFIXES: Record<
  FiatRateProviderId,
  readonly string[]
> = {
  kraken: ['/0/public/Ticker'],
  coingecko: ['/api/v3/simple/price'],
  blockchain: ['/ticker'],
}

function isKnownFiatRateProviderId(id: string): id is FiatRateProviderId {
  return id === 'kraken' || id === 'coingecko' || id === 'blockchain'
}

function isFiatRatePathAllowedForProvider(
  providerId: FiatRateProviderId,
  pathname: string,
): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/'
  return FIAT_RATE_PROVIDER_PATH_PREFIXES[providerId].some((prefix) => {
    const p = prefix.replace(/\/$/, '') || '/'
    return normalized === p || normalized.startsWith(`${p}/`)
  })
}

function hasUnsafePathSegment(segments: string[]): boolean {
  return segments.some((s) => s === '.' || s === '..')
}

function isProxiedUrlPathWithinAllowlistedBase(
  upstreamUrl: string,
  allowlistedBaseTrimmed: string,
): boolean {
  let resolved: URL
  let base: URL
  try {
    resolved = new URL(upstreamUrl)
    base = new URL(allowlistedBaseTrimmed)
  } catch {
    return false
  }
  if (resolved.origin !== base.origin) return false

  const basePath = base.pathname.replace(/\/$/, '') || '/'
  const resPath = resolved.pathname

  if (basePath === '/') return true
  if (resPath === basePath) return true
  return resPath.startsWith(`${basePath}/`)
}

const UPSTREAM_TIMEOUT_MS = 5_000
const MAX_POST_BODY_BYTES = 512_000

function applyFiatRatesProxyCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = fiatRatesProxyCorsAllowedOrigin(req.headers.origin)
  if (origin != null) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
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
  applyFiatRatesProxyCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const url = new URL(req.url!, `https://${req.headers.host}`)
  const prefix = '/api/fiat-rates/'
  if (!url.pathname.startsWith(prefix)) {
    res.status(404).send('Not found')
    return
  }

  const rest = url.pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length < 2) {
    res.status(400).send('Bad path')
    return
  }
  if (hasUnsafePathSegment(segments)) {
    res.status(400).send('Bad path')
    return
  }

  const providerId = segments[0]!
  if (!isKnownFiatRateProviderId(providerId)) {
    res.status(404).send('Unknown provider')
    return
  }

  const base = FIAT_RATE_PROVIDER_BASES[providerId]
  const baseTrim = base.replace(/\/$/, '')
  const subpath = segments.slice(1).join('/')
  const pathSuffix = subpath ? `/${subpath}` : ''
  const pathnameOnly =
    pathSuffix === '' ? '/' : pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`

  if (!isFiatRatePathAllowedForProvider(providerId, pathnameOnly)) {
    res.status(400).send('Bad path')
    return
  }

  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`
  if (!isProxiedUrlPathWithinAllowlistedBase(upstreamUrl, baseTrim)) {
    res.status(400).send('Bad path')
    return
  }

  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  const forwardHeaders: Record<string, string> = {}
  const accept = req.headers['accept']
  if (accept && typeof accept === 'string') forwardHeaders['accept'] = accept
  const contentType = req.headers['content-type']
  if (contentType && typeof contentType === 'string')
    forwardHeaders['content-type'] = contentType

  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }
  if (method === 'POST') {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const body = Buffer.concat(chunks)
    if (body.byteLength > MAX_POST_BODY_BYTES) {
      res.status(413).send('Payload too large')
      return
    }
    init.body = body
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, init)
  } catch {
    res.status(502).send('Upstream unreachable')
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

  const body = await upstream.arrayBuffer()
  res.status(upstream.status).send(Buffer.from(body))
}
