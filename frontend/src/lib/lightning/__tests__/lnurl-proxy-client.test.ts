import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildLnurlProxyFetchUrl,
  fetchLnurlHttpGet,
  LNURL_SAME_ORIGIN_PROXY_PREFIX,
} from '@/lib/lightning/lnurl-proxy-client'
import { LnurlFetchError } from '@/lib/lightning/lnurl-pay-errors'

const UPSTREAM_URL = 'https://pay.example.com/.well-known/lnurlp/user'

describe('buildLnurlProxyFetchUrl', () => {
  it('builds same-origin proxy URL with encoded upstream', () => {
    const proxyUrl = buildLnurlProxyFetchUrl(UPSTREAM_URL)
    expect(proxyUrl).toContain(`${LNURL_SAME_ORIGIN_PROXY_PREFIX}/fetch?url=`)
    expect(proxyUrl).toContain(encodeURIComponent(UPSTREAM_URL))
  })
})

describe('fetchLnurlHttpGet', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://app.example' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('direct OK does not call proxy', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      expect(url).toBe(UPSTREAM_URL)
      return new Response(JSON.stringify({ tag: 'payRequest' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchLnurlHttpGet(UPSTREAM_URL)
    expect(response.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('direct TypeError falls back to proxy', async () => {
    const proxyUrl = buildLnurlProxyFetchUrl(UPSTREAM_URL)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === UPSTREAM_URL) {
        throw new TypeError('Failed to fetch')
      }
      if (url === proxyUrl) {
        return new Response(JSON.stringify({ tag: 'payRequest' }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchLnurlHttpGet(UPSTREAM_URL)
    expect(response.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(proxyUrl)
  })

  it('proxy failure throws LnurlFetchError', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url === UPSTREAM_URL) {
        throw new TypeError('Failed to fetch')
      }
      throw new TypeError('Proxy failed')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLnurlHttpGet(UPSTREAM_URL)).rejects.toBeInstanceOf(
      LnurlFetchError,
    )
  })

  it('does not proxy when direct returns HTTP error', async () => {
    const fetchMock = vi.fn(async () => new Response('error', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchLnurlHttpGet(UPSTREAM_URL)
    expect(response.status).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
