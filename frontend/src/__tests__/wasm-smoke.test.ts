import { describe, it, expect } from 'vitest'
import { greet } from '@/wasm-pkg/bitboard_crypto'

describe('WASM smoke test', () => {
  it('calls greet and returns expected string', () => {
    expect(greet('World')).toBe('Hello from bitboard-crypto, World!')
  })
})
