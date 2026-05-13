import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildMainnetFiatRateRequestUrl,
  parseFiatRateProviderResponse,
} from '../fiat-rate-client'

describe('buildMainnetFiatRateRequestUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds Kraken proxied ticker URL with encoded pair', () => {
    vi.stubGlobal('location', { origin: 'https://app.example' } as Location)
    expect(buildMainnetFiatRateRequestUrl('kraken', 'USD')).toBe(
      'https://app.example/api/fiat-rates/kraken/0/public/Ticker?pair=XXBTZUSD',
    )
  })

  it('builds CoinGecko simple price URL', () => {
    vi.stubGlobal('location', { origin: 'https://app.example' } as Location)
    expect(buildMainnetFiatRateRequestUrl('coingecko', 'EUR')).toBe(
      'https://app.example/api/fiat-rates/coingecko/api/v3/simple/price?ids=bitcoin&vs_currencies=eur',
    )
  })

  it('builds Blockchain ticker URL', () => {
    vi.stubGlobal('location', { origin: 'https://app.example' } as Location)
    expect(buildMainnetFiatRateRequestUrl('blockchain', 'GBP')).toBe(
      'https://app.example/api/fiat-rates/blockchain/ticker',
    )
  })
})

describe('parseFiatRateProviderResponse', () => {
  it('parses Kraken Ticker last trade from first result entry', () => {
    const json = {
      error: [],
      result: {
        XXBTZUSD: {
          a: ['50001.1', '1', '1.0'],
          b: ['50000.0', '1', '1.0'],
          c: ['50000.5', '0.01'],
          v: ['100', '200'],
          p: ['49950', '50050'],
          t: [100, 200],
          l: ['49000', '49500'],
          h: ['51000', '50500'],
          o: '49500',
        },
      },
    }
    expect(parseFiatRateProviderResponse('kraken', 'USD', json)).toEqual({
      btcPriceInFiat: 50000.5,
    })
  })

  it('parses CoinGecko nested bitcoin price', () => {
    expect(
      parseFiatRateProviderResponse('coingecko', 'USD', {
        bitcoin: { usd: 42_000.25 },
      }),
    ).toEqual({ btcPriceInFiat: 42_000.25 })
  })

  it('parses Blockchain.com ticker last', () => {
    expect(
      parseFiatRateProviderResponse('blockchain', 'EUR', {
        EUR: { last: '38000.5' },
      }),
    ).toEqual({ btcPriceInFiat: 38000.5 })
  })

  it('returns null for malformed payloads', () => {
    expect(parseFiatRateProviderResponse('coingecko', 'USD', null)).toBeNull()
    expect(parseFiatRateProviderResponse('blockchain', 'USD', {})).toBeNull()
    expect(parseFiatRateProviderResponse('kraken', 'USD', { result: {} })).toBeNull()
  })
})
