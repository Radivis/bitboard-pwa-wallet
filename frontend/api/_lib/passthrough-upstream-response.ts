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

/**
 * Builds a client response that forwards the upstream body and status while stripping
 * hop-by-hop headers (RFC 9110) that must not be forwarded by proxies.
 */
export function passthroughUpstreamResponse(upstream: Response): Response {
  const outHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      outHeaders.set(key, value)
    }
  })
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  })
}
