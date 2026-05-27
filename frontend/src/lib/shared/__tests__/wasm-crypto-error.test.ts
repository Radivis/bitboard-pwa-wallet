import { describe, expect, it } from 'vitest'
import { errorMessage } from '@/lib/shared/utils'
import {
  parseWasmCryptoError,
  wasmCryptoErrorCode,
  wasmCryptoErrorMessage,
} from '@/lib/shared/wasm-crypto-error'

describe('parseWasmCryptoError', () => {
  it('parses structured object', () => {
    const payload = {
      code: 'no_active_wallet',
      message: 'No active wallet. Call create_wallet or load_wallet first.',
    }
    expect(parseWasmCryptoError(payload)).toEqual(payload)
  })

  it('errorMessage returns message from structured object', () => {
    expect(
      errorMessage({
        code: 'transaction',
        message: 'Transaction error: insufficient funds',
      }),
    ).toBe('Transaction error: insufficient funds')
  })

  it('leaves legacy string errors unchanged', () => {
    expect(errorMessage('plain failure')).toBe('plain failure')
    expect(errorMessage(new Error('legacy message'))).toBe('legacy message')
  })

  it('wasmCryptoErrorCode returns no_active_wallet', () => {
    expect(
      wasmCryptoErrorCode({
        code: 'no_active_wallet',
        message: 'No active wallet. Call create_wallet or load_wallet first.',
      }),
    ).toBe('no_active_wallet')
    expect(
      wasmCryptoErrorMessage({
        code: 'mnemonic',
        message: 'Mnemonic error: invalid count',
      }),
    ).toBe('Mnemonic error: invalid count')
  })
})
