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
    expect(getArkOperatorUrl('mutinynet')).toBe(
      `${window.location.origin}/api/arkade/operator/mutinynet`,
    )
  })

  it('maps whitelisted custom operator URL to proxy', () => {
    expect(
      customArkOperatorMatchesWhitelistedBase(
        'https://mutinynet.arkade.sh',
        'mutinynet',
      ),
    ).toBe(true)
    expect(getArkOperatorUrl('mutinynet', 'https://mutinynet.arkade.sh')).toBe(
      `${window.location.origin}/api/arkade/operator/mutinynet`,
    )
  })

  it('passes through non-whitelisted custom operator URL', () => {
    expect(getArkOperatorUrl('mainnet', 'https://example-operator.test')).toBe(
      'https://example-operator.test',
    )
  })
})
