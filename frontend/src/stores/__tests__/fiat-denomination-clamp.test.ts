import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FiatRateProviderId } from '@/lib/fiat/fiat-rate-service-whitelist'

const { fetchQueryMock } = vi.hoisted(() => ({
  fetchQueryMock: vi.fn(),
}))

vi.mock('@/lib/shared/app-query-client', () => ({
  appQueryClient: {
    fetchQuery: fetchQueryMock,
  },
}))

import { clampDefaultFiatCurrencyToProviderDiscovery } from '@/stores/fiat-denomination-clamp'

describe('clampDefaultFiatCurrencyToProviderDiscovery', () => {
  beforeEach(() => {
    fetchQueryMock.mockReset()
  })

  it('clamps to fallback when persisted currency is not in discovery list', async () => {
    fetchQueryMock.mockResolvedValue({
      codes: ['EUR', 'USD'],
      krakenPairByCode: {},
    })

    const clampToFallback = vi.fn()
    const snapshot = {
      defaultFiatCurrency: 'CHF',
      fiatRateProvider: 'kraken' as FiatRateProviderId,
    }

    await clampDefaultFiatCurrencyToProviderDiscovery(
      'kraken',
      () => snapshot,
      clampToFallback,
    )

    expect(clampToFallback).toHaveBeenCalledOnce()
  })

  it('does not clamp when currency is supported', async () => {
    fetchQueryMock.mockResolvedValue({
      codes: ['EUR', 'USD'],
      krakenPairByCode: {},
    })

    const clampToFallback = vi.fn()
    const snapshot = {
      defaultFiatCurrency: 'EUR',
      fiatRateProvider: 'coingecko' as FiatRateProviderId,
    }

    await clampDefaultFiatCurrencyToProviderDiscovery(
      'coingecko',
      () => snapshot,
      clampToFallback,
    )

    expect(clampToFallback).not.toHaveBeenCalled()
  })

  it('does not clamp when store provider no longer matches requested provider', async () => {
    fetchQueryMock.mockResolvedValue({
      codes: ['USD'],
      krakenPairByCode: {},
    })

    const clampToFallback = vi.fn()
    await clampDefaultFiatCurrencyToProviderDiscovery(
      'kraken',
      () => ({
        defaultFiatCurrency: 'CHF',
        fiatRateProvider: 'coingecko',
      }),
      clampToFallback,
    )

    expect(clampToFallback).not.toHaveBeenCalled()
  })

  it('ignores stale in-flight discovery after a newer clamp was scheduled', async () => {
    let resolveFirstDiscovery!: (value: unknown) => void
    let fetchCallCount = 0
    fetchQueryMock.mockImplementation(() => {
      fetchCallCount += 1
      if (fetchCallCount === 1) {
        return new Promise((resolve) => {
          resolveFirstDiscovery = resolve
        })
      }
      return Promise.resolve({ codes: ['USD'], krakenPairByCode: {} })
    })

    const clampToFallback = vi.fn()
    const snapshotAfterProviderSwitch = {
      defaultFiatCurrency: 'CHF',
      fiatRateProvider: 'coingecko' as FiatRateProviderId,
    }

    const slowKrakenClamp = clampDefaultFiatCurrencyToProviderDiscovery(
      'kraken',
      () => ({
        defaultFiatCurrency: 'CHF',
        fiatRateProvider: 'kraken',
      }),
      clampToFallback,
    )
    const coingeckoClamp = clampDefaultFiatCurrencyToProviderDiscovery(
      'coingecko',
      () => snapshotAfterProviderSwitch,
      clampToFallback,
    )

    await coingeckoClamp
    resolveFirstDiscovery({ codes: ['EUR', 'GBP'], krakenPairByCode: {} })
    await slowKrakenClamp

    expect(clampToFallback).toHaveBeenCalledOnce()
  })
})
