import { describe, it, expect } from 'vitest'
import { validateEsploraUrl } from '../bitcoin-utils'

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
