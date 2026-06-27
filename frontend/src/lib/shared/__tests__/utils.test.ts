import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_SYNC_ERROR_FALLBACK,
  errorMessage,
  userFacingErrorMessage,
  userFacingLifecycleErrorMessage,
} from '@/lib/shared/utils'

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

describe('userFacingLifecycleErrorMessage', () => {
  it('uses fallback when sanitization yields empty', () => {
    expect(userFacingLifecycleErrorMessage('', LIFECYCLE_SYNC_ERROR_FALLBACK)).toBe(
      LIFECYCLE_SYNC_ERROR_FALLBACK,
    )
  })

  it('sanitizes error detail like userFacingErrorMessage', () => {
    const err = new Error('Sync failed: https://esplora.example.com')
    expect(userFacingLifecycleErrorMessage(err, LIFECYCLE_SYNC_ERROR_FALLBACK)).toBe(
      'Sync failed: [url]',
    )
  })
})
