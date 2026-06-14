import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLnurlProxyUpstreamUrlAllowed } from './lnurl-proxy-upstream-url'

const UPSTREAM_TIMEOUT_MS = 8_000

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

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  res.setHeader('Access-Control-Max-Age', '86400')
}

/**
 * Forward a validated LNURL upstream GET/HEAD. Used by the Vite dev proxy plugin.
 */
export async function forwardLnurlProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamUrl: string,
): Promise<void> {
  setCorsHeaders(res)

  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    res.end('Method not allowed')
    return
  }

  if (!isLnurlProxyUpstreamUrlAllowed(upstreamUrl)) {
    res.statusCode = 400
    res.end('Bad URL')
    return
  }

  const forwardHeaders: Record<string, string> = {}
  const accept = req.headers.accept
  if (accept != null && typeof accept === 'string') {
    forwardHeaders.accept = accept
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    res.statusCode = 502
    res.end('Upstream unreachable')
    return
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    res.statusCode = 502
    res.end('Upstream redirect not allowed')
    return
  }

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower)) return
    if (DROP_FOR_SAME_ORIGIN_CLIENT.has(lower)) return
    res.setHeader(key, value)
  })

  res.statusCode = upstream.status
  if (method === 'HEAD') {
    res.end()
    return
  }

  const body = await upstream.arrayBuffer()
  res.end(Buffer.from(body))
}
