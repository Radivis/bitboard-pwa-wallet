import { LnurlFetchError } from '@/lib/lightning/lnurl-pay-errors'

export const LNURL_SAME_ORIGIN_PROXY_PREFIX = '/api/lnurl'

export function buildLnurlProxyFetchUrl(upstreamUrl: string): string {
  const origin =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : ''
  return `${origin}${LNURL_SAME_ORIGIN_PROXY_PREFIX}/fetch?url=${encodeURIComponent(upstreamUrl)}`
}

function isDirectFetchNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}

/**
 * GET an LNURL upstream URL from the browser: direct first, same-origin proxy on CORS/network failure.
 */
export async function fetchLnurlHttpGet(upstreamUrl: string): Promise<Response> {
  try {
    return await fetch(upstreamUrl)
  } catch (error) {
    if (!isDirectFetchNetworkFailure(error)) {
      throw error
    }
    try {
      return await fetch(buildLnurlProxyFetchUrl(upstreamUrl))
    } catch {
      throw new LnurlFetchError()
    }
  }
}
