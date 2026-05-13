import { describe, expect, it } from 'vitest'
import { fiatRatesProxyCorsAllowedOrigin } from '@/lib/fiat-rates-proxy-cors'

describe('fiatRatesProxyCorsAllowedOrigin', () => {
  it('allows production origins', () => {
    expect(fiatRatesProxyCorsAllowedOrigin('https://bitboard-wallet.com')).toBe(
      'https://bitboard-wallet.com',
    )
    expect(fiatRatesProxyCorsAllowedOrigin('https://app.bitboard-wallet.com')).toBe(
      'https://app.bitboard-wallet.com',
    )
  })

  it('allows Radivis Vercel preview host shape', () => {
    expect(
      fiatRatesProxyCorsAllowedOrigin(
        'https://bitboard-pwa-wallet-m4a0c8ptp-radivis-projects.vercel.app',
      ),
    ).toBe('https://bitboard-pwa-wallet-m4a0c8ptp-radivis-projects.vercel.app')
  })

  it('rejects other origins', () => {
    expect(fiatRatesProxyCorsAllowedOrigin('https://evil.example')).toBeNull()
    expect(
      fiatRatesProxyCorsAllowedOrigin(
        'https://not-bitboard-pwa-wallet-m4a0c8ptp-radivis-projects.vercel.app',
      ),
    ).toBeNull()
    expect(
      fiatRatesProxyCorsAllowedOrigin(
        'https://bitboard-pwa-wallet-m4a0c8ptp-other-team.vercel.app',
      ),
    ).toBeNull()
  })

  it('returns null for missing origin', () => {
    expect(fiatRatesProxyCorsAllowedOrigin(undefined)).toBeNull()
    expect(fiatRatesProxyCorsAllowedOrigin('')).toBeNull()
  })
})
