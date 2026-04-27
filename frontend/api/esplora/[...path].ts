import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getUpstreamBaseForEsploraProxy,
  isKnownEsploraProviderId,
} from '@/lib/esplora-service-whitelist'
import {
  hasUnsafePathSegment,
  isProxiedUrlPathWithinAllowlistedBase,
} from '@/lib/validate-proxied-upstream-url'

export const config = {
  maxDuration: 10,
}

/** Align with client Esplora client timeout + small margin (ms). */
const UPSTREAM_TIMEOUT_MS = 5_000

const MAX_POST_BODY_BYTES = 512_000

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
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

  res.status(upstream.status)
  Object.entries(outHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (upstream.body) {
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  }
  res.end()
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
