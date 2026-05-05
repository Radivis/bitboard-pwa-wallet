import { describe, expect, it } from 'vitest'
import {
  BadLocalChainStateError,
  asBadLocalChainStateError,
  isBadLocalChainStateMessage,
} from '@/lib/bad-local-chain-state-error'

describe('isBadLocalChainStateMessage', () => {
  it('matches Esplora header hash error from WASM Blockchain error string', () => {
    expect(
      isBadLocalChainStateMessage(
        'Blockchain error: HeaderHashNotFound(BlockHash(000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f))',
      ),
    ).toBe(true)
  })

  it('matches header height not found', () => {
    expect(
      isBadLocalChainStateMessage(
        'Blockchain error: HeaderHeightNotFound(12345)',
      ),
    ).toBe(true)
  })

  it('does not match unrelated blockchain errors', () => {
    expect(isBadLocalChainStateMessage('Blockchain error: HttpResponse')).toBe(
      false,
    )
    expect(isBadLocalChainStateMessage('Network error')).toBe(false)
  })
})

describe('asBadLocalChainStateError', () => {
  it('returns the same instance when already BadLocalChainStateError', () => {
    const e = new BadLocalChainStateError()
    expect(asBadLocalChainStateError(e)).toBe(e)
  })

  it('returns BadLocalChainStateError with cause when message matches', () => {
    const inner = new Error(
      'Blockchain error: HeaderHashNotFound(BlockHash(abc))',
    )
    const out = asBadLocalChainStateError(inner)
    expect(out).toBeInstanceOf(BadLocalChainStateError)
    expect(out?.message).toContain('Full rescan')
    expect(out?.cause).toBe(inner)
  })

  it('returns null when message does not match', () => {
    expect(asBadLocalChainStateError(new Error('timeout'))).toBeNull()
  })
})

describe('BadLocalChainStateError', () => {
  it('has stable name for instanceof checks', () => {
    const e = new BadLocalChainStateError()
    expect(e.name).toBe('BadLocalChainStateError')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(BadLocalChainStateError)
  })
})
