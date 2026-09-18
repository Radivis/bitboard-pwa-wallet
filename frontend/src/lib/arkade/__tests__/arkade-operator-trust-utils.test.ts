import { describe, expect, it } from 'vitest'
import {
  isOperatorTrustPendingDigestChangedError,
  OPERATOR_TRUST_PENDING_DIGEST_CHANGED_CODE,
  operatorTrustPendingDigestChangedMessage,
} from '@/lib/arkade/arkade-operator-trust-utils'

describe('arkade-operator-trust-utils', () => {
  it('detects operator trust digest changed wasm error code', () => {
    const error = new Error(
      JSON.stringify({
        code: OPERATOR_TRUST_PENDING_DIGEST_CHANGED_CODE,
        message: 'The operator published newer configuration while you were reviewing.',
      }),
    )
    expect(isOperatorTrustPendingDigestChangedError(error)).toBe(true)
    expect(operatorTrustPendingDigestChangedMessage(error)).toContain('newer configuration')
  })

  it('ignores unrelated errors', () => {
    expect(isOperatorTrustPendingDigestChangedError(new Error('network down'))).toBe(false)
  })
})
