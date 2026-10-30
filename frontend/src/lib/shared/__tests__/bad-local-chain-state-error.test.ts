import { describe, expect, it } from 'vitest'
import {
  BadLocalChainStateError,
  asBadLocalChainStateError,
  isBadLocalChainStateMessage,
} from '@/lib/shared/bad-local-chain-state-error'
import {
  WASM_CRYPTO_ERROR_CODE_ESPLORA_CHAIN_MISMATCH,
  WASM_CRYPTO_ERROR_CODE_ESPLORA_NETWORK_MISMATCH,
} from '@/lib/shared/wasm-crypto-error'

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
    const error = new BadLocalChainStateError()
    expect(asBadLocalChainStateError(error)).toBe(error)
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

  it('recognises the esplora_chain_mismatch WASM error code', () => {
    const inner = new Error(
      JSON.stringify({
        code: WASM_CRYPTO_ERROR_CODE_ESPLORA_CHAIN_MISMATCH,
        message: 'Esplora chain mismatch: update forks from the saved chain at genesis',
      }),
    )
    const out = asBadLocalChainStateError(inner)
    expect(out).toBeInstanceOf(BadLocalChainStateError)
    expect(out?.message).toContain('Full rescan')
    expect(out?.cause).toBe(inner)
  })

  it('does not treat esplora_network_mismatch as bad local chain state', () => {
    const inner = new Error(
      JSON.stringify({
        code: WASM_CRYPTO_ERROR_CODE_ESPLORA_NETWORK_MISMATCH,
        message: 'Esplora server is on Mutinynet, but this wallet is on Signet.',
      }),
    )
    expect(asBadLocalChainStateError(inner)).toBeNull()
  })
})

describe('BadLocalChainStateError', () => {
  it('has stable name for instanceof checks', () => {
    const error = new BadLocalChainStateError()
    expect(error.name).toBe('BadLocalChainStateError')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(BadLocalChainStateError)
  })
})
