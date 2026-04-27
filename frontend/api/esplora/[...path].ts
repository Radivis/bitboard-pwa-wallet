import { passthroughUpstreamResponse } from '../_lib/passthrough-upstream-response'
import {
  getUpstreamBaseForEsploraProxy,
  isKnownEsploraProviderId,
} from '../../src/lib/esplora-service-whitelist'

export const config = {
  runtime: 'edge',
}

/** Align with client Esplora client timeout + small margin (ms). */
const UPSTREAM_TIMEOUT_MS = 5_000

const MAX_POST_BODY_BYTES = 512_000

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const prefix = '/api/esplora/'
  if (!url.pathname.startsWith(prefix)) {
    return new Response('Not found', { status: 404 })
  }

  const rest = url.pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length < 2) {
    return new Response('Bad path', { status: 400 })
  }

  const providerId = segments[0]!
  const network = segments[1]!
  if (!isKnownEsploraProviderId(providerId)) {
    return new Response('Unknown provider', { status: 404 })
  }

  const base = getUpstreamBaseForEsploraProxy(providerId, network)
  if (base == null) {
    return new Response('Unknown network for provider', { status: 404 })
  }

  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const esploraSubpath = segments.slice(2).join('/')
  const baseTrim = base.replace(/\/$/, '')
  const pathSuffix = esploraSubpath ? `/${esploraSubpath}` : ''
  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`

  const forwardHeaders = new Headers()
  const accept = request.headers.get('accept')
  if (accept) forwardHeaders.set('accept', accept)
  const contentType = request.headers.get('content-type')
  if (contentType) forwardHeaders.set('content-type', contentType)

  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }
  if (method === 'POST') {
    const buf = await request.arrayBuffer()
    if (buf.byteLength > MAX_POST_BODY_BYTES) {
      return new Response('Payload too large', { status: 413 })
    }
    init.body = buf
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, init)
  } catch {
    return new Response('Upstream unreachable', { status: 502 })
  }

  return passthroughUpstreamResponse(upstream)
}
