import { describe, expect, it } from 'vitest'
import {
  hasUnsafePathSegment,
  isProxiedUrlPathWithinAllowlistedBase,
} from '@/lib/validate-proxied-upstream-url'

describe('hasUnsafePathSegment', () => {
  it('is true for .. or .', () => {
    expect(hasUnsafePathSegment(['a', '..', 'b'])).toBe(true)
    expect(hasUnsafePathSegment(['a', '.', 'b'])).toBe(true)
  })

  it('is false for normal segments', () => {
    expect(hasUnsafePathSegment(['default', 'mainnet', 'blocks', 'tip', 'height'])).toBe(
      false,
    )
  })
})

describe('isProxiedUrlPathWithinAllowlistedBase', () => {
  it('rejects path escape via .. resolution (mempool /api base)', () => {
    const base = 'https://mempool.space/api'
    expect(
      isProxiedUrlPathWithinAllowlistedBase(
        'https://mempool.space/api/../blocks/tip/height',
        base,
      ),
    ).toBe(false)
  })

  it('allows paths under the base', () => {
    const base = 'https://mempool.space/api'
    expect(
      isProxiedUrlPathWithinAllowlistedBase(
        'https://mempool.space/api/blocks/tip/height',
        base,
      ),
    ).toBe(true)
  })

  it('allows exact base path', () => {
    expect(
      isProxiedUrlPathWithinAllowlistedBase('https://mempool.space/api', 'https://mempool.space/api'),
    ).toBe(true)
  })

  it('rejects different origin', () => {
    expect(
      isProxiedUrlPathWithinAllowlistedBase('https://evil.com/api/tx', 'https://mempool.space/api'),
    ).toBe(false)
  })

  it('allows any same-origin path when allowlisted base pathname is root', () => {
    const base = 'https://testnet4.info'
    expect(
      isProxiedUrlPathWithinAllowlistedBase('https://testnet4.info/foo/bar', base),
    ).toBe(true)
  })
})
