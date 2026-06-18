import { describe, expect, it } from 'vitest'
import { MAX_LNURL_BECH32_LENGTH } from '@/lib/lightning/lightning-input-limits'
import { isLnurlProxyUpstreamUrlAllowed } from '@/lib/lightning/lnurl-proxy-upstream-url'

describe('isLnurlProxyUpstreamUrlAllowed', () => {
  it('allows public HTTPS LNURL endpoint', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed(
        'https://pay.example.com/.well-known/lnurlp/user',
      ),
    ).toBe(true)
  })

  it('rejects http protocol', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed('http://pay.example.com/.well-known/lnurlp/user'),
    ).toBe(false)
  })

  it('rejects localhost hostname', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed('https://localhost/.well-known/lnurlp/user'),
    ).toBe(false)
  })

  it('rejects 127.0.0.1 IPv4 literal', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed('https://127.0.0.1/.well-known/lnurlp/user'),
    ).toBe(false)
  })

  it('rejects 10.x private IPv4', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed('https://10.0.0.1/.well-known/lnurlp/user'),
    ).toBe(false)
  })

  it('rejects 192.168.x private IPv4', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed(
        'https://192.168.1.1/.well-known/lnurlp/user',
      ),
    ).toBe(false)
  })

  it('rejects URL with embedded credentials', () => {
    expect(
      isLnurlProxyUpstreamUrlAllowed(
        'https://user:pass@pay.example.com/.well-known/lnurlp/user',
      ),
    ).toBe(false)
  })

  it('rejects URL longer than 2048 chars', () => {
    const longPath = 'a'.repeat(MAX_LNURL_BECH32_LENGTH)
    expect(
      isLnurlProxyUpstreamUrlAllowed(`https://pay.example.com/${longPath}`),
    ).toBe(false)
  })
})
