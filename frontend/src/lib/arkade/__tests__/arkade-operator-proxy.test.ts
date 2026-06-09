import { describe, expect, it } from 'vitest'
import {
  customArkOperatorMatchesWhitelistedBase,
  getArkOperatorUrl,
} from '@/lib/arkade/arkade-operator-proxy'

describe('arkade-operator-proxy', () => {
  it('returns same-origin proxy for default operators', () => {
    expect(getArkOperatorUrl('mainnet')).toBe(
      `${window.location.origin}/api/arkade/operator/mainnet`,
    )
    expect(getArkOperatorUrl('signet')).toBe(
      `${window.location.origin}/api/arkade/operator/signet`,
    )
  })

  it('maps whitelisted custom operator URL to proxy', () => {
    expect(
      customArkOperatorMatchesWhitelistedBase(
        'https://mutinynet.arkade.sh',
        'signet',
      ),
    ).toBe(true)
    expect(getArkOperatorUrl('signet', 'https://mutinynet.arkade.sh')).toBe(
      `${window.location.origin}/api/arkade/operator/signet`,
    )
  })

  it('passes through non-whitelisted custom operator URL', () => {
    expect(getArkOperatorUrl('mainnet', 'https://example-operator.test')).toBe(
      'https://example-operator.test',
    )
  })
})
