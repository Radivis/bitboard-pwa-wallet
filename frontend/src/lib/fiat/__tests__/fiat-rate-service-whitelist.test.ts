import { describe, it, expect } from 'vitest'
import {
  FIAT_RATE_PROVIDER_BASES,
  getUpstreamBaseForFiatRateProxy,
  isFiatRatePathAllowedForProvider,
  isKnownFiatRateProviderId,
} from '../fiat-rate-service-whitelist'

describe('fiat rate proxy allowlist', () => {
  it('recognizes known provider ids and maps bases', () => {
    expect(isKnownFiatRateProviderId('kraken')).toBe(true)
    expect(isKnownFiatRateProviderId('evil')).toBe(false)
    expect(getUpstreamBaseForFiatRateProxy('coingecko')).toBe(
      FIAT_RATE_PROVIDER_BASES.coingecko,
    )
    expect(getUpstreamBaseForFiatRateProxy('unknown')).toBeNull()
  })

  it('allows exact Kraken ticker path (server proxy forwards query strings without validating them)', () => {
    expect(isFiatRatePathAllowedForProvider('kraken', '/0/public/Ticker')).toBe(true)
  })

  it('rejects path escape and other providers’ paths', () => {
    expect(isFiatRatePathAllowedForProvider('kraken', '/0/private/Balance')).toBe(
      false,
    )
    expect(
      isFiatRatePathAllowedForProvider('coingecko', '/0/public/Ticker'),
    ).toBe(false)
  })

  it('allows Kraken AssetPairs discovery path', () => {
    expect(isFiatRatePathAllowedForProvider('kraken', '/0/public/AssetPairs')).toBe(true)
  })

  it('allows CoinGecko supported vs_currencies path', () => {
    expect(
      isFiatRatePathAllowedForProvider(
        'coingecko',
        '/api/v3/simple/supported_vs_currencies',
      ),
    ).toBe(true)
  })

  it('allows Blockchain /ticker only as prefix', () => {
    expect(isFiatRatePathAllowedForProvider('blockchain', '/ticker')).toBe(true)
    expect(isFiatRatePathAllowedForProvider('blockchain', '/rawtx/abc')).toBe(
      false,
    )
  })
})
