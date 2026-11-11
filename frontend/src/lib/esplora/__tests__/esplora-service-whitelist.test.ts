import { describe, expect, it } from 'vitest'
import {
  customEsploraMatchesWhitelistedBase,
  decideEsploraMirrorResponse,
  ESPLORA_PROVIDER_BASES,
  esploraViteProxyEntries,
  esploraFallbackUpstreamBase,
  getUpstreamBaseForEsploraProxy,
  isEsploraUpstreamFailoverStatus,
  isKnownEsploraProviderId,
  isWhitelistedEsploraBaseUrl,
  normalizeEsploraBaseUrl,
  REGTEST_ESPLORA_PROXY_LOCAL_PREFIX,
  REGTEST_ESPLORA_UPSTREAM_BASE,
  shouldWarnEsploraNotWhitelisted,
} from '@/lib/esplora/esplora-service-whitelist'

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

  it('matches blockstream testnet4 as the blockstream provider', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://blockstream.info/testnet4/api/',
        'testnet',
      ),
    ).toEqual({ providerId: 'blockstream' })
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

  it('matches default public signet (mempool signet)', () => {
    expect(
      customEsploraMatchesWhitelistedBase(
        'https://mempool.space/signet/api',
        'signet',
      ),
    ).toEqual({ providerId: 'default' })
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

  it('resolves blockstream testnet4', () => {
    expect(getUpstreamBaseForEsploraProxy('blockstream', 'testnet')).toBe(
      ESPLORA_PROVIDER_BASES.blockstream.testnet,
    )
  })

  it('falls back from default testnet4 to the blockstream mirror', () => {
    expect(esploraFallbackUpstreamBase('default', 'testnet')).toBe(
      'https://blockstream.info/testnet4/api',
    )
  })

  it('has no fallback for mutinynet or an explicit blockstream choice', () => {
    expect(esploraFallbackUpstreamBase('default', 'mutinynet')).toBeNull()
    expect(esploraFallbackUpstreamBase('blockstream', 'testnet')).toBeNull()
  })

  it('fails over on gateway errors and keeps rate limits on the preferred host', () => {
    expect(isEsploraUpstreamFailoverStatus(429)).toBe(false)
    expect(isEsploraUpstreamFailoverStatus(503)).toBe(true)
    expect(isEsploraUpstreamFailoverStatus(200)).toBe(false)
    expect(isEsploraUpstreamFailoverStatus(404)).toBe(false)
  })

  it('keeps the preferred response when the mirror is rate limited', () => {
    expect(decideEsploraMirrorResponse(502, 429)).toEqual({
      useFallbackResponse: false,
      markPreferredHostDown: false,
    })
    expect(decideEsploraMirrorResponse(null, 429)).toEqual({
      useFallbackResponse: true,
      markPreferredHostDown: false,
    })
  })

  it('moves to the mirror after a gateway failure that the mirror can serve', () => {
    expect(decideEsploraMirrorResponse(502, 200)).toEqual({
      useFallbackResponse: true,
      markPreferredHostDown: true,
    })
  })

  it('resolves legacy testnet and has no legacy signet row', () => {
    expect(getUpstreamBaseForEsploraProxy('legacy', 'testnet')).toBe(
      ESPLORA_PROVIDER_BASES.legacy.testnet,
    )
    expect(getUpstreamBaseForEsploraProxy('legacy', 'signet')).toBeNull()
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

describe('esploraViteProxyEntries', () => {
  it('includes a Vite-only regtest entry targeting the local gateway', () => {
    const regtestEntry = esploraViteProxyEntries().find(
      (entry) => entry.localPrefix === REGTEST_ESPLORA_PROXY_LOCAL_PREFIX,
    )
    expect(regtestEntry).toEqual({
      localPrefix: '/api/esplora/default/regtest',
      targetOrigin: 'http://127.0.0.1:7030',
      upstreamPathPrefix: '/api',
    })
    expect(REGTEST_ESPLORA_UPSTREAM_BASE).toBe('http://127.0.0.1:7030/api')
  })
})
