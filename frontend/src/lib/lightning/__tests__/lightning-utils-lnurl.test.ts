import { describe, expect, it } from 'vitest'
import { decodeLnurlBech32ToUrl } from '@/lib/lightning/decode-lnurl-bech32'
import {
  isLnurlBech32String,
  isLnurlPayDestination,
  isLnurlpSchemeUrl,
  isValidLightningDestination,
  normalizeLightningDestination,
  normalizeLnurlpSchemeToHttps,
} from '@/lib/lightning/lightning-utils'

/** LUD-01 example bech32 LNURL. */
const LUD01_LNURL =
  'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS'

describe('isLnurlBech32String', () => {
  it('detects lowercase lnurl1', () => {
    expect(isLnurlBech32String('lnurl1dp68gurn8ghj7')).toBe(true)
  })

  it('detects uppercase LNURL1', () => {
    expect(isLnurlBech32String(LUD01_LNURL)).toBe(true)
  })

  it('rejects bolt11', () => {
    expect(isLnurlBech32String('lntbs1test')).toBe(false)
  })
})

describe('isLnurlpSchemeUrl', () => {
  it('detects lnurlp scheme', () => {
    expect(isLnurlpSchemeUrl('lnurlp://pay.example.com/lnurl')).toBe(true)
  })

  it('rejects https URL', () => {
    expect(isLnurlpSchemeUrl('https://pay.example.com/lnurl')).toBe(false)
  })
})

describe('isLnurlPayDestination', () => {
  it('accepts bech32 and lnurlp forms', () => {
    expect(isLnurlPayDestination(LUD01_LNURL)).toBe(true)
    expect(isLnurlPayDestination('lnurlp://pay.example.com/x')).toBe(true)
  })
})

describe('isValidLightningDestination', () => {
  it('includes LNURL-pay', () => {
    expect(isValidLightningDestination(LUD01_LNURL)).toBe(true)
    expect(isValidLightningDestination('lnurlp://pay.example.com/x')).toBe(true)
  })
})

describe('normalizeLightningDestination', () => {
  it('strips lightning: prefix from LNURL', () => {
    expect(normalizeLightningDestination(`lightning:${LUD01_LNURL}`)).toBe(
      LUD01_LNURL,
    )
  })
})

describe('normalizeLnurlpSchemeToHttps', () => {
  it('converts lnurlp to https', () => {
    expect(normalizeLnurlpSchemeToHttps('lnurlp://pay.example.com/path')).toBe(
      'https://pay.example.com/path',
    )
  })
})

describe('decodeLnurlBech32ToUrl', () => {
  it('decodes LUD-01 example to HTTPS URL', () => {
    expect(decodeLnurlBech32ToUrl(LUD01_LNURL)).toBe(
      'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df',
    )
  })
})
