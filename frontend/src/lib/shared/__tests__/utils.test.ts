import { describe, expect, it } from 'vitest'
import { errorMessage, userFacingErrorMessage } from '@/lib/shared/utils'

describe('userFacingErrorMessage', () => {
  it('strips URLs from messages shown in toasts', () => {
    const err = new Error('Blockchain error: failed https://mempool.space/api/block')
    expect(errorMessage(err)).toContain('https://mempool.space')
    expect(userFacingErrorMessage(err)).toBe(
      'Blockchain error: failed [url]',
    )
  })

  it('parses structured WASM payload then sanitizes', () => {
    const err = new Error(
      JSON.stringify({
        code: 'blockchain',
        message: 'Blockchain error: GET https://esplora.example.com/tx',
      }),
    )
    expect(userFacingErrorMessage(err)).toBe('Blockchain error: GET [url]')
  })
})
