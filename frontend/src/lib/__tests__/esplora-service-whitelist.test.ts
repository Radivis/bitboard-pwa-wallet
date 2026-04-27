import { describe, expect, it } from 'vitest'
import {
  customEsploraMatchesWhitelistedBase,
  ESPLORA_PROVIDER_BASES,
  getUpstreamBaseForEsploraProxy,
  isKnownEsploraProviderId,
  isWhitelistedEsploraBaseUrl,
  normalizeEsploraBaseUrl,
  shouldWarnEsploraNotWhitelisted,
} from '@/lib/esplora-service-whitelist'

describe('normalizeEsploraBaseUrl', () => {
  it('strips trailing slashes and lowercases host', () => {
    expect(normalizeEsploraBaseUrl('HTTPS://Mempool.Space/api/')).toBe(
      'https://mempool.space/api',
    )
  })

  it('returns null for invalid input', () => {
    expect(normalizeEsploraBaseUrl('not a url')).toBeNull()
  })
})

describe('customEsploraMatchesWhitelistedBase', () => {
  it('matches default mainnet base', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://mempool.space/api',
        'mainnet',
      ),
    ).toEqual({ providerId: 'default' })
  })

  it('matches default testnet4 base with trailing slash', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://mempool.space/testnet4/api/',
        'testnet',
      ),
    ).toEqual({ providerId: 'default' })
  })

  it('matches blockstream mainnet', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://blockstream.info/api',
        'mainnet',
      ),
    ).toEqual({ providerId: 'blockstream' })
  })

  it('matches legacy testnet3 (Blockstream testnet API)', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://blockstream.info/testnet/api',
        'testnet',
      ),
    ).toEqual({ providerId: 'legacy' })
  })

  it('matches legacy standard signet (mempool signet, not mutinynet)', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://mempool.space/signet/api',
        'signet',
      ),
    ).toEqual({ providerId: 'legacy' })
  })

  it('returns null for unknown host', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://example.com/api',
        'mainnet',
      ),
    ).toBeNull()
  })

  it('returns null when network does not match provider row', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://mempool.space/api',
        'testnet',
      ),
    ).toBeNull()
  })
})

describe('getUpstreamBaseForEsploraProxy', () => {
  it('resolves default mainnet', () => {
    expect(getUpstreamBaseForEsploraProxy('default', 'mainnet')).toBe(
      ESPLORA_PROVIDER_BASES.default.mainnet,
    )
  })

  it('returns null for invalid provider', () => {
    expect(getUpstreamBaseForEsploraProxy('evil', 'mainnet')).toBeNull()
  })

  it('returns null for blockstream testnet (not configured)', () => {
    expect(getUpstreamBaseForEsploraProxy('blockstream', 'testnet')).toBeNull()
  })

  it('resolves legacy testnet and signet', () => {
    expect(getUpstreamBaseForEsploraProxy('legacy', 'testnet')).toBe(
      ESPLORA_PROVIDER_BASES.legacy.testnet,
    )
    expect(getUpstreamBaseForEsploraProxy('legacy', 'signet')).toBe(
      ESPLORA_PROVIDER_BASES.legacy.signet,
    )
  })
})

describe('isKnownEsploraProviderId', () => {
  it('accepts configured ids only', () => {
    expect(isKnownEsploraProviderId('default')).toBe(true)
    expect(isKnownEsploraProviderId('blockstream')).toBe(true)
    expect(isKnownEsploraProviderId('legacy')).toBe(true)
    expect(isKnownEsploraProviderId('other')).toBe(false)
  })
})

describe('shouldWarnEsploraNotWhitelisted', () => {
  it('is false for regtest', () => {
    expect(shouldWarnEsploraNotWhitelisted('https://evil.com', 'regtest')).toBe(
      false,
    )
  })

  it('is false for whitelisted mainnet URL', () => {
    expect(
      shouldWarnEsploraNotWhitelisted('https://mempool.space/api', 'mainnet'),
    ).toBe(false)
  })

  it('is true for off-list mainnet URL', () => {
    expect(
      shouldWarnEsploraNotWhitelisted('https://unknown.example/api', 'mainnet'),
    ).toBe(true)
  })

  it('is false for empty string', () => {
    expect(shouldWarnEsploraNotWhitelisted('', 'mainnet')).toBe(false)
  })
})

describe('isWhitelistedEsploraBaseUrl', () => {
  it('is true for lab (not proxy networks)', () => {
    expect(isWhitelistedEsploraBaseUrl('https://anything', 'lab')).toBe(true)
  })
})
