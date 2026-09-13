import { describe, expect, it } from 'vitest'
import {
  BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE,
  replaceRawBlockchainFetchErrorMessage,
  sanitizeErrorMessageForUi,
} from '@/lib/shared/sanitize-error-for-ui'

describe('sanitizeErrorMessageForUi', () => {
  it('passes through short benign messages', () => {
    expect(sanitizeErrorMessageForUi('unit test error')).toBe('unit test error')
    expect(sanitizeErrorMessageForUi('sqlite failure')).toBe('sqlite failure')
  })

  it('replaces Unix-style absolute paths', () => {
    expect(
      sanitizeErrorMessageForUi('open failed /home/radivis/proj/db.sqlite'),
    ).toBe('open failed [path]')
  })

  it('replaces file URLs', () => {
    expect(
      sanitizeErrorMessageForUi('could not open file:///home/x/wallet.db'),
    ).toBe('could not open [file]')
  })

  it('replaces http and https URLs', () => {
    expect(
      sanitizeErrorMessageForUi('GET http://127.0.0.1:3002/blocks/tip/height'),
    ).toBe('GET [url]')
  })

  it('replaces bundle URLs inside WASM/reqwest-style stack snippets', () => {
    const raw =
      'reqwest::Error { kind: Request, source: "JsValue(TypeError: Failed to fetch\\n' +
      'TypeError: Failed to fetch\\n at Re(https://example.com/assets/bitboard_crypto-abc.js:1:15629)" }'
    expect(sanitizeErrorMessageForUi(raw)).toBe(BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE)
  })

  it('replaces Mutinynet WASM Blockchain Failed to fetch dumps', () => {
    const raw =
      'Blockchain error: Reqwest(reqwest::Error { kind: Request, source: "JsValue(TypeError: Failed to fetch\\n' +
      'TypeError: Failed to fetch\\n at __wbg_fetch_9dad4fe911207b37 (http://localhost:3000/src/wasm-pkg/bitboard_ark/bitboard_ark_bg.js:925:14)" })'
    expect(replaceRawBlockchainFetchErrorMessage(raw)).toBe(
      BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE,
    )
    expect(sanitizeErrorMessageForUi(raw)).toBe(BLOCKCHAIN_EXPLORER_UNREACHABLE_UI_MESSAGE)
  })

  it('leaves unrelated errors unchanged', () => {
    expect(replaceRawBlockchainFetchErrorMessage('autonomous_exit_materials_missing')).toBe(
      'autonomous_exit_materials_missing',
    )
  })

  it('leaves a plain Failed to fetch string unchanged', () => {
    expect(replaceRawBlockchainFetchErrorMessage('Failed to fetch')).toBe('Failed to fetch')
    expect(sanitizeErrorMessageForUi('Failed to fetch')).toBe('Failed to fetch')
  })

  it('replaces Windows paths', () => {
    expect(
      sanitizeErrorMessageForUi('failed C:\\Users\\me\\wallet.db'),
    ).toBe('failed [path]')
  })

  it('collapses whitespace', () => {
    expect(sanitizeErrorMessageForUi('a\n\n  b')).toBe('a b')
  })

  it('truncates very long messages', () => {
    const long = 'x'.repeat(400)
    const out = sanitizeErrorMessageForUi(long)
    expect(out.length).toBeLessThanOrEqual(320)
    expect(out.endsWith('…')).toBe(true)
  })
})
