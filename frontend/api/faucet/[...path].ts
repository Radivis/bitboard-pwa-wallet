import { passthroughUpstreamResponse } from '../_lib/passthrough-upstream-response'
import {
  getUpstreamBaseForFaucetProxy,
  isKnownFaucetId,
} from '../../src/lib/faucet-definitions'

export const config = {
  runtime: 'edge',
}

const UPSTREAM_TIMEOUT_MS = 8_000

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const prefix = '/api/faucet/'
  if (!url.pathname.startsWith(prefix)) {
    return new Response('Not found', { status: 404 })
  }

  const rest = url.pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  if (segments.length < 1) {
    return new Response('Bad path', { status: 400 })
  }

  const faucetId = segments[0]!
  if (!isKnownFaucetId(faucetId)) {
    return new Response('Unknown faucet', { status: 404 })
  }

  const base = getUpstreamBaseForFaucetProxy(faucetId)
  if (base == null) {
    return new Response('Unknown faucet', { status: 404 })
  }

  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const faucetSubpath = segments.slice(1).join('/')
  const baseTrim = base.replace(/\/$/, '')
  const pathSuffix = faucetSubpath ? `/${faucetSubpath}` : ''
  const upstreamUrl = `${baseTrim}${pathSuffix}${url.search}`

  const forwardHeaders = new Headers()
  const accept = request.headers.get('accept')
  if (accept) forwardHeaders.set('accept', accept)

  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, init)
  } catch {
    return new Response('Upstream unreachable', { status: 502 })
  }

  return passthroughUpstreamResponse(upstream)
}
