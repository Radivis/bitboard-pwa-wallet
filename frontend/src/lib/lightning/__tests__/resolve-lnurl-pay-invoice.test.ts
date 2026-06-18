import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bech32 } from '@scure/base'
import { resolveLnurlPayInvoice } from '@/lib/lightning/resolve-lnurl-pay-invoice'
import { LnurlUnsupportedTagError } from '@/lib/lightning/lnurl-pay-errors'
import { buildLnurlProxyFetchUrl } from '@/lib/lightning/lnurl-proxy-client'

const LNURL_PAY_HTTPS_URL = 'https://e2e.test/.well-known/lnurlp/user'
const LNURL_CALLBACK_URL = 'https://e2e.test/lnurl/callback'
const SIGNET_BOLT11 =
  'lntbs1lnurltestinvoiceplaceholderxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

function encodeLnurlForUrl(url: string): string {
  const words = bech32.toWords(new TextEncoder().encode(url))
  return bech32.encode('lnurl', words, 2000)
}

const LNURL_BECH32 = encodeLnurlForUrl(LNURL_PAY_HTTPS_URL)

function payRequestJson(overrides: Record<string, unknown> = {}) {
  return {
    tag: 'payRequest',
    callback: LNURL_CALLBACK_URL,
    minSendable: 1_000,
    maxSendable: 1_000_000_000,
    metadata: '[["text/plain","Coffee"]]',
    ...overrides,
  }
}

describe('resolveLnurlPayInvoice', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://app.example' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url === LNURL_PAY_HTTPS_URL) {
          return new Response(JSON.stringify(payRequestJson()), { status: 200 })
        }
        if (url.startsWith(LNURL_CALLBACK_URL)) {
          return new Response(JSON.stringify({ pr: SIGNET_BOLT11 }), {
            status: 200,
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves payRequest to bolt11', async () => {
    const result = await resolveLnurlPayInvoice({
      recipient: LNURL_BECH32,
      amountSats: 5_000,
    })
    expect(result.bolt11).toBe(SIGNET_BOLT11)
  })

  it('supports lnurlp scheme URLs', async () => {
    const result = await resolveLnurlPayInvoice({
      recipient: `lnurlp://${LNURL_PAY_HTTPS_URL.slice('https://'.length)}`,
      amountSats: 5_000,
    })
    expect(result.bolt11).toBe(SIGNET_BOLT11)
  })

  it('rejects amount outside LNURL bounds', async () => {
    await expect(
      resolveLnurlPayInvoice({
        recipient: LNURL_BECH32,
        amountSats: 0,
      }),
    ).rejects.toThrow(/Amount must be between/)
  })

  it('rejects unsupported withdraw tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            tag: 'withdrawRequest',
            callback: LNURL_CALLBACK_URL,
            minWithdrawable: 1_000,
            maxWithdrawable: 1_000_000,
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      resolveLnurlPayInvoice({
        recipient: LNURL_BECH32,
        amountSats: 1_000,
      }),
    ).rejects.toBeInstanceOf(LnurlUnsupportedTagError)
  })

  it('rejects non-HTTPS decoded URL', async () => {
    const httpLnurl = encodeLnurlForUrl('http://insecure.test/lnurl')
    await expect(
      resolveLnurlPayInvoice({
        recipient: httpLnurl,
        amountSats: 1_000,
      }),
    ).rejects.toThrow('LNURL pay links must use HTTPS')
  })

  it('surfaces fetch failures clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    await expect(
      resolveLnurlPayInvoice({
        recipient: LNURL_BECH32,
        amountSats: 1_000,
      }),
    ).rejects.toThrow('Could not reach LNURL server')
  })

  it('preserves existing callback query params while setting amount and metadataHash', async () => {
    const callbackWithQuery = `${LNURL_CALLBACK_URL}?k1=server-token&nonce=123`
    const callbackRequestUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url === LNURL_PAY_HTTPS_URL) {
          return new Response(
            JSON.stringify(
              payRequestJson({
                callback: callbackWithQuery,
              }),
            ),
            { status: 200 },
          )
        }
        if (url.startsWith(LNURL_CALLBACK_URL)) {
          callbackRequestUrls.push(url)
          return new Response(JSON.stringify({ pr: SIGNET_BOLT11 }), {
            status: 200,
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    await resolveLnurlPayInvoice({
      recipient: LNURL_BECH32,
      amountSats: 5_000,
    })

    expect(callbackRequestUrls).toHaveLength(1)
    const callbackUrl = new URL(callbackRequestUrls[0])
    expect(callbackUrl.searchParams.get('k1')).toBe('server-token')
    expect(callbackUrl.searchParams.get('nonce')).toBe('123')
    expect(callbackUrl.searchParams.get('amount')).toBe('5000000')
    expect(callbackUrl.searchParams.get('metadataHash')).toBeTruthy()
  })

  it('uses proxy when direct metadata fetch fails with network error', async () => {
    const metadataProxyUrl = buildLnurlProxyFetchUrl(LNURL_PAY_HTTPS_URL)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url === LNURL_PAY_HTTPS_URL || url.startsWith(LNURL_CALLBACK_URL)) {
          throw new TypeError('Failed to fetch')
        }
        if (url === metadataProxyUrl) {
          return new Response(JSON.stringify(payRequestJson()), { status: 200 })
        }
        const proxyUpstream = new URL(url).searchParams.get('url')
        if (proxyUpstream?.startsWith(LNURL_CALLBACK_URL)) {
          return new Response(JSON.stringify({ pr: SIGNET_BOLT11 }), {
            status: 200,
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const result = await resolveLnurlPayInvoice({
      recipient: LNURL_BECH32,
      amountSats: 5_000,
    })
    expect(result.bolt11).toBe(SIGNET_BOLT11)
  })
})
