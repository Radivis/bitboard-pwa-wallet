import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  fetchEsploraTipBlockHeight,
  formatSats,
  parseBTC,
  validateEsploraUrl,
} from '../bitcoin-utils'

describe('validateEsploraUrl', () => {
  it('accepts valid https URL for mainnet', () => {
    expect(() =>
      validateEsploraUrl('https://mempool.space/api', 'mainnet'),
    ).not.toThrow()
  })

  it('accepts valid https URL for testnet', () => {
    expect(() =>
      validateEsploraUrl('https://mempool.space/testnet/api', 'testnet'),
    ).not.toThrow()
  })

  it('accepts valid https URL for signet', () => {
    expect(() =>
      validateEsploraUrl('https://mempool.space/signet/api', 'signet'),
    ).not.toThrow()
  })

  it('accepts Mutinynet default Esplora URL for signet', () => {
    expect(() =>
      validateEsploraUrl('https://mutinynet.com/api', 'signet'),
    ).not.toThrow()
  })

  it('accepts http URL for regtest', () => {
    expect(() =>
      validateEsploraUrl('http://localhost:3002', 'regtest'),
    ).not.toThrow()
  })

  it('accepts https URL for regtest', () => {
    expect(() =>
      validateEsploraUrl('https://localhost:3002', 'regtest'),
    ).not.toThrow()
  })

  it('rejects http URL for mainnet', () => {
    expect(() =>
      validateEsploraUrl('http://example.com/api', 'mainnet'),
    ).toThrow(/requires HTTPS/)
  })

  it('rejects http URL for testnet', () => {
    expect(() =>
      validateEsploraUrl('http://example.com/testnet', 'testnet'),
    ).toThrow(/requires HTTPS/)
  })

  it('rejects invalid URL', () => {
    expect(() => validateEsploraUrl('not-a-url', 'mainnet')).toThrow(
      'Invalid URL',
    )
  })

  it('rejects empty string', () => {
    expect(() => validateEsploraUrl('', 'mainnet')).toThrow('Invalid URL')
  })
})

describe('fetchEsploraTipBlockHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and parses plain-text tip height', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ' 987654 \n',
      }),
    )

    const height = await fetchEsploraTipBlockHeight('https://example.com/api')
    expect(height).toBe(987654)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://example.com/api/blocks/tip/height',
    )
  })
})

describe('formatSats', () => {
  it('formats as a plain integer string (no grouping, no fraction)', () => {
    expect(formatSats(1234)).toBe('1234')
    expect(formatSats(1000.9)).toBe('1000')
    expect(formatSats(546)).toBe('546')
  })

  it('returns 0 for invalid inputs', () => {
    expect(formatSats(-1)).toBe('0')
    expect(formatSats(Number.NaN)).toBe('0')
  })
})

describe('parseBTC', () => {
  it('parses valid BTC string to sats', () => {
    expect(parseBTC('0')).toBe(0)
    expect(parseBTC('1')).toBe(100_000_000)
    expect(parseBTC('0.5')).toBe(50_000_000)
    expect(parseBTC('0.00000001')).toBe(1)
    expect(parseBTC('  0.1  ')).toBe(10_000_000)
  })

  it('returns 0 for NaN', () => {
    expect(parseBTC('abc')).toBe(0)
    expect(parseBTC('nope')).toBe(0)
  })

  it('returns 0 for negative values', () => {
    expect(parseBTC('-1')).toBe(0)
    expect(parseBTC('-0.00000001')).toBe(0)
  })

  it('returns 0 for non-finite values', () => {
    expect(parseBTC('Infinity')).toBe(0)
    expect(parseBTC('-Infinity')).toBe(0)
  })

  it('returns 0 for empty or whitespace-only string', () => {
    expect(parseBTC('')).toBe(0)
    expect(parseBTC('   ')).toBe(0)
  })

  it('clamps very large values to MAX_SAFE_INTEGER', () => {
    const huge = '100000000'
    const sats = parseBTC(huge)
    expect(sats).toBe(Number.MAX_SAFE_INTEGER)
    expect(sats).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER)
  })
})
