import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 10,
}

// Inlined from src/lib/faucet-definitions.ts
type FaucetEntry = {
  id: string
  url: string
}

const FAUCET_ENTRIES: FaucetEntry[] = [
  { id: 'mempool-testnet4', url: 'https://mempool.space/testnet4/faucet' },
  { id: 'testnet4-dev', url: 'https://faucet.testnet4.dev/' },
  { id: 'coinfaucet-eu', url: 'https://coinfaucet.eu/en/btc-testnet4/' },
  { id: 'testnet4-info', url: 'https://testnet4.info/' },
  { id: 'eternitybits', url: 'https://eternitybits.com/faucet/' },
  { id: 'mutinynet', url: 'https://faucet.mutinynet.com/' },
]

function getUpstreamBaseForFaucetProxy(faucetId: string): string | null {
  const entry = FAUCET_ENTRIES.find((e) => e.id === faucetId)
  return entry?.url ?? null
}

function isKnownFaucetId(id: string): boolean {
  return FAUCET_ENTRIES.some((e) => e.id === id)
}

// Inlined from src/lib/validate-proxied-upstream-url.ts
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

// Constants
const UPSTREAM_TIMEOUT_MS = 8_000

// CORS headers for browser requests
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
])

const DROP_FOR_SAME_ORIGIN_CLIENT = new Set(['set-cookie', 'set-cookie2'])

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Set CORS headers for all responses
  setCorsHeaders(res)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const url = new URL(req.url!, `https://${req.headers.host}`)
  const prefix = '/api/faucet/'
  if (!url.pathname.startsWith(prefix)) {
    res.status(404).send('Not found')
    return
  }

  const rest = url.pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length < 1) {
    res.status(400).send('Bad path')
    return
  }
  if (hasUnsafePathSegment(segments)) {
    res.status(400).send('Bad path')
    return
  }

  const faucetId = segments[0]!
  if (!isKnownFaucetId(faucetId)) {
    res.status(404).send('Unknown faucet')
    return
  }

  const base = getUpstreamBaseForFaucetProxy(faucetId)
  if (base == null) {
    res.status(404).send('Unknown faucet')
    return
  }

  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    res.status(405).send('Method not allowed')
    return
  }

  const faucetSubpath = segments.slice(1).join('/')
  const baseTrim = base.replace(/\/$/, '')
  const pathSuffix = faucetSubpath ? `/${faucetSubpath}` : ''
  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`
  if (!isProxiedUrlPathWithinAllowlistedBase(upstreamUrl, baseTrim)) {
    res.status(400).send('Bad path')
    return
  }

  const forwardHeaders: Record<string, string> = {}
  const accept = req.headers['accept']
  if (accept && typeof accept === 'string') forwardHeaders['accept'] = accept

  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
