import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 10,
}

// Inlined from src/lib/esplora-service-whitelist.ts
type EsploraProxyNetwork = 'mainnet' | 'testnet' | 'signet'
type EsploraProviderId = 'default' | 'blockstream' | 'legacy'
type ProviderBases = Partial<Record<EsploraProxyNetwork, string>>

const ESPLORA_PROVIDER_BASES: Record<EsploraProviderId, ProviderBases> = {
  default: {
    mainnet: 'https://mempool.space/api',
    testnet: 'https://mempool.space/testnet4/api',
    signet: 'https://mutinynet.com/api',
  },
  blockstream: {
    mainnet: 'https://blockstream.info/api',
    signet: 'https://blockstream.info/signet/api',
  },
  legacy: {
    testnet: 'https://blockstream.info/testnet/api',
    signet: 'https://mempool.space/signet/api',
  },
}

function isEsploraProxyNetwork(mode: string): mode is EsploraProxyNetwork {
  return mode === 'mainnet' || mode === 'testnet' || mode === 'signet'
}

function isKnownEsploraProviderId(id: string): id is EsploraProviderId {
  return id === 'default' || id === 'blockstream' || id === 'legacy'
}

function getUpstreamBaseForEsploraProxy(
  providerId: string,
  network: string,
): string | null {
  if (!isEsploraProxyNetwork(network)) return null
  if (!isKnownEsploraProviderId(providerId)) return null
  const base = ESPLORA_PROVIDER_BASES[providerId][network]
  return base ?? null
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
const UPSTREAM_TIMEOUT_MS = 5_000
const MAX_POST_BODY_BYTES = 512_000

// CORS headers for browser requests
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
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
  'content-encoding', // Don't forward - fetch auto-decompresses, Vercel re-compresses
  'content-length', // Length changes after decompression
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
  const prefix = '/api/esplora/'
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
  const network = segments[1]!
  if (!isKnownEsploraProviderId(providerId)) {
    res.status(404).send('Unknown provider')
    return
  }

  const base = getUpstreamBaseForEsploraProxy(providerId, network)
  if (base == null) {
    res.status(404).send('Unknown network for provider')
    return
  }

  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  const esploraSubpath = segments.slice(2).join('/')
  const baseTrim = base.replace(/\/$/, '')
  const pathSuffix = esploraSubpath ? `/${esploraSubpath}` : ''
  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`
  if (!isProxiedUrlPathWithinAllowlistedBase(upstreamUrl, baseTrim)) {
    res.status(400).send('Bad path')
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
