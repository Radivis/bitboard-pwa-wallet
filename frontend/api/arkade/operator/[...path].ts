import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 300,
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

// Inlined from src/lib/arkade/arkade-operator-sse-proxy.ts — keep in sync.
const OPERATOR_SSE_UPSTREAM_PATHS = ['v1/batch/events', 'v1/txs'] as const
const OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX = 'v1/script/subscription/'

function normalizeOperatorSubpath(operatorSubpath: string): string {
  return operatorSubpath.replace(/^\/+/, '').replace(/\/+$/, '')
}

function acceptsEventStream(acceptHeader: string | undefined): boolean {
  if (acceptHeader == null || acceptHeader === '') {
    return false
  }
  return acceptHeader.toLowerCase().includes('text/event-stream')
}

function isOperatorSseUpstreamPath(normalizedSubpath: string): boolean {
  if (
    OPERATOR_SSE_UPSTREAM_PATHS.some(
      (ssePath) =>
        normalizedSubpath === ssePath ||
        normalizedSubpath.startsWith(`${ssePath}/`),
    )
  ) {
    return true
  }
  return normalizedSubpath.startsWith(OPERATOR_SSE_SUBSCRIPTION_PATH_PREFIX)
}

function isOperatorServerSentEventsRequest(
  method: string,
  operatorSubpath: string,
  acceptHeader: string | undefined,
): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false
  }
  if (!acceptsEventStream(acceptHeader)) {
    return false
  }
  return isOperatorSseUpstreamPath(normalizeOperatorSubpath(operatorSubpath))
}

// Stay below Vercel Hobby's ~10s function cap for unary operator calls (see esplora proxy).
const UNARY_UPSTREAM_TIMEOUT_MS = 9_000
/** Slightly below handler maxDuration so long-lived SSE connections fail cleanly. */
const SSE_UPSTREAM_TIMEOUT_MS = 295_000
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

type ResponseWithSocket = VercelResponse & {
  socket?: { setNoDelay?: (value: boolean) => void }
  flushHeaders?: () => void
}

function copySafeUpstreamHeaders(upstream: Response): Record<string, string> {
  const outHeaders: Record<string, string> = {}
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(lower)) return
    if (DROP_FOR_SAME_ORIGIN_CLIENT.has(lower)) return
    outHeaders[key] = value
  })
  return outHeaders
}

async function proxyOperatorServerSentEvents(
  req: VercelRequest,
  res: VercelResponse,
  upstreamUrl: string,
  forwardHeaders: Record<string, string>,
): Promise<void> {
  const abortController = new AbortController()
  const abortUpstream = () => {
    abortController.abort()
  }
  req.on('close', abortUpstream)
  req.on('aborted', abortUpstream)

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: forwardHeaders,
      signal: AbortSignal.any([
        abortController.signal,
        AbortSignal.timeout(SSE_UPSTREAM_TIMEOUT_MS),
      ]),
    })
  } catch {
    res
      .status(502)
      .send(
        'proxy_error upstream_unreachable: could not reach Ark operator upstream',
      )
    return
  } finally {
    req.off('close', abortUpstream)
    req.off('aborted', abortUpstream)
  }

  if (!upstream.ok) {
    const errorBody = await upstream.text()
    res.status(upstream.status).send(errorBody)
    return
  }

  const upstreamContentType = upstream.headers.get('content-type')
  res.status(200)
  res.setHeader('Content-Type', upstreamContentType ?? 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const responseWithSocket = res as ResponseWithSocket
  responseWithSocket.socket?.setNoDelay?.(true)
  responseWithSocket.flushHeaders?.()

  const reader = upstream.body?.getReader()
  if (reader == null) {
    res.end()
    return
  }

  const clientAbortController = new AbortController()
  const onClientDisconnect = () => {
    clientAbortController.abort()
    void reader.cancel()
  }
  req.on('close', onClientDisconnect)
  req.on('aborted', onClientDisconnect)

  try {
    while (!clientAbortController.signal.aborted && !res.writableEnded) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value == null || value.byteLength === 0) {
        continue
      }
      const canContinue = res.write(Buffer.from(value))
      if (!canContinue) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
  } catch {
    // Client disconnect or upstream close — end quietly.
  } finally {
    req.off('close', onClientDisconnect)
    req.off('aborted', onClientDisconnect)
    if (!res.writableEnded) {
      res.end()
    }
  }
}

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
  const accept =
    typeof req.headers['accept'] === 'string' ? req.headers['accept'] : undefined
  if (accept != null) {
    forwardHeaders['accept'] = accept
  }
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

  if (isOperatorServerSentEventsRequest(method, operatorSubpath, accept)) {
    await proxyOperatorServerSentEvents(req, res, upstreamUrl, forwardHeaders)
    return
  }

  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(UNARY_UPSTREAM_TIMEOUT_MS),
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
    res
      .status(502)
      .send(
        'proxy_error upstream_unreachable: could not reach Ark operator upstream',
      )
    return
  }

  const outHeaders = copySafeUpstreamHeaders(upstream)
  Object.entries(outHeaders).forEach(([k, v]) => res.setHeader(k, v))

  const body = await upstream.arrayBuffer()
  res.status(upstream.status).send(Buffer.from(body))
}
