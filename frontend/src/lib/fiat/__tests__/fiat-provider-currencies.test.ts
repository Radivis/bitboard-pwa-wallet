import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildFiatProviderCurrenciesDiscoveryUrl,
  parseBlockchainTickerKeys,
  parseCoinGeckoSupportedVsCurrencies,
  parseKrakenAssetPairsForBtcFiat,
} from '../fiat-provider-currencies'

describe('buildFiatProviderCurrenciesDiscoveryUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds proxied discovery URLs per provider', () => {
    vi.stubGlobal('location', { origin: 'https://app.example' } as Location)
    expect(buildFiatProviderCurrenciesDiscoveryUrl('kraken')).toBe(
      'https://app.example/api/fiat-rates/kraken/0/public/AssetPairs',
    )
    expect(buildFiatProviderCurrenciesDiscoveryUrl('coingecko')).toBe(
      'https://app.example/api/fiat-rates/coingecko/api/v3/simple/supported_vs_currencies',
    )
    expect(buildFiatProviderCurrenciesDiscoveryUrl('blockchain')).toBe(
      'https://app.example/api/fiat-rates/blockchain/ticker',
    )
  })
})

describe('parseKrakenAssetPairsForBtcFiat', () => {
  it('extracts online XBT/fiat pairs from wsname', () => {
    const json = {
      error: [],
      result: {
        XXBTZUSD: { status: 'online', wsname: 'XBT/USD' },
        XXBTZEUR: { status: 'online', wsname: 'XBT/EUR' },
        XXBTUSDR: { status: 'online', wsname: 'XBT/USDR' },
        OFFLINE: { status: 'offline', wsname: 'XBT/GBP' },
      },
    }
    expect(parseKrakenAssetPairsForBtcFiat(json)).toEqual({
      codes: ['EUR', 'USD'],
      krakenPairByCode: {
        EUR: 'XXBTZEUR',
        USD: 'XXBTZUSD',
      },
    })
  })
})

describe('parseCoinGeckoSupportedVsCurrencies', () => {
  it('keeps only ISO 4217 fiat codes', () => {
    expect(parseCoinGeckoSupportedVsCurrencies(['usd', 'btc', 'eur', 'x'])).toEqual({
      codes: ['EUR', 'USD'],
      krakenPairByCode: {},
    })
  })
})

describe('parseBlockchainTickerKeys', () => {
  it('filters ticker keys to ISO 4217', () => {
    expect(
      parseBlockchainTickerKeys({
        USD: { last: 1 },
        btc_invalid: { last: 1 },
        EUR: { last: 1 },
      }),
    ).toEqual({
      codes: ['EUR', 'USD'],
      krakenPairByCode: {},
    })
  })
})
