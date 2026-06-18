import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 30,
}

// Inlined from src/lib/arkade/arkade-operator-proxy.ts
const ARKADE_OPERATOR_UPSTREAM_BASES: Record<string, string> = {
  mainnet: 'https://arkade.computer',
  signet: 'https://mutinynet.arkade.sh',
}

function getUpstreamArkOperatorBase(network: string): string | null {
  return ARKADE_OPERATOR_UPSTREAM_BASES[network] ?? null
}

// Inlined from src/lib/shared/validate-proxied-upstream-url.ts
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

const UPSTREAM_TIMEOUT_MS = 30_000
const MAX_POST_BODY_BYTES = 2_000_000

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, X-Build-Version, X-SDK-Version, X-Digest',
  )
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
  const prefix = '/api/arkade/operator/'
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

  const network = segments[0]!
  const base = getUpstreamArkOperatorBase(network)
  if (base == null) {
    res.status(404).send('Unknown network')
    return
  }

  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  const operatorSubpath = segments.slice(1).join('/')
  const baseTrim = base.replace(/\/$/, '')
  const pathSuffix = operatorSubpath ? `/${operatorSubpath}` : ''
  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`
  if (!isProxiedUrlPathWithinAllowlistedBase(upstreamUrl, baseTrim)) {
    res.status(400).send('Bad path')
    return
  }

  const forwardHeaders: Record<string, string> = {}
  const accept = req.headers['accept']
  if (accept && typeof accept === 'string') forwardHeaders['accept'] = accept
  const contentType = req.headers['content-type']
  if (contentType && typeof contentType === 'string') {
    forwardHeaders['content-type'] = contentType
  }
  for (const headerName of ['x-build-version', 'x-sdk-version', 'x-digest'] as const) {
    const value = req.headers[headerName]
    if (value && typeof value === 'string') {
      forwardHeaders[headerName] = value
    }
  }

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
