import { describe, expect, it } from 'vitest'
import { enrichArkadeOperatorErrorMessage } from '@/lib/arkade/arkade-operator-error-enrichment'

describe('enrichArkadeOperatorErrorMessage', () => {
  it('appends batch SSE hint for Vercel function crash during join batch', () => {
    const message =
      'Ark client error: Failed to join batch: batch event stream: request failed: Event stream request failed with status 500: FUNCTION_INVOCATION_FAILED'
    const enriched = enrichArkadeOperatorErrorMessage(message)
    expect(enriched).toContain('FUNCTION_INVOCATION_FAILED')
    expect(enriched).toContain('batch event stream')
    expect(enriched).toContain('Preview proxy failed during batch event stream')
  })

  it('appends digest mismatch guidance', () => {
    const enriched = enrichArkadeOperatorErrorMessage(
      'request failed: error in response: status code 400: DIGEST_MISMATCH',
    )
    expect(enriched).toContain('Refresh your Ark session')
  })

  it('appends batch wedge warning for duplicated input', () => {
    const enriched = enrichArkadeOperatorErrorMessage(
      'Failed to join batch: status code 400: duplicated input',
    )
    expect(enriched).toContain('do not retry blindly')
  })

  it('leaves unrelated errors unchanged', () => {
    const message = 'Wallet error: insufficient funds'
    expect(enrichArkadeOperatorErrorMessage(message)).toBe(message)
  })
})
