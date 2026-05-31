import { describe, expect, it } from 'vitest'
import { errorMessage } from '@/lib/shared/utils'
import {
  isBenignNoActiveWalletError,
  NO_ACTIVE_WALLET_WASM_MESSAGE,
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

  it('parses JSON payload embedded in Error.message from Comlink worker boundary', () => {
    const error = new Error(
      JSON.stringify({
        code: 'no_active_wallet',
        message: NO_ACTIVE_WALLET_WASM_MESSAGE,
      }),
    )
    expect(parseWasmCryptoError(error)).toEqual({
      code: 'no_active_wallet',
      message: NO_ACTIVE_WALLET_WASM_MESSAGE,
    })
  })

  it('isBenignNoActiveWalletError accepts structured and legacy shapes', () => {
    expect(
      isBenignNoActiveWalletError({
        code: 'no_active_wallet',
        message: NO_ACTIVE_WALLET_WASM_MESSAGE,
      }),
    ).toBe(true)
    expect(
      isBenignNoActiveWalletError(
        new Error(NO_ACTIVE_WALLET_WASM_MESSAGE),
      ),
    ).toBe(true)
    expect(isBenignNoActiveWalletError(new Error('other failure'))).toBe(false)
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
